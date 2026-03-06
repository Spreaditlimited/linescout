import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { findActiveWhiteLabelExemption } from "@/lib/white-label-exemptions";
import { marketplaceCurrency, resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import { getFxRate } from "@/lib/fx";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toNum(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("product_id") || 0);
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Missing product_id" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelSettings(conn);
      await ensureWhiteLabelUserColumns(conn);
      await ensureWhiteLabelProductsReady(conn);

      const [[settings]]: any = await conn.query(
        `SELECT white_label_subscription_countries, white_label_trial_days, white_label_insights_daily_limit
         FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settings?.white_label_subscription_countries));
      const trialDays = Number(settings?.white_label_trial_days || 0);
      const dailyInsightsLimit = Math.max(1, Number(settings?.white_label_insights_daily_limit || 2));

      const [[userRow]]: any = await conn.query(
        `
        SELECT u.white_label_plan, u.white_label_subscription_status,
               u.white_label_trial_ends_at,
               u.white_label_insights_date, u.white_label_insights_used,
               u.email,
               u.white_label_next_billing_at,
               c.id AS country_id,
               c.iso2 AS country_iso2,
               c.amazon_marketplace AS country_marketplace,
               c.amazon_enabled AS amazon_enabled,
               cur.code AS currency_code
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [user.id]
      );

      const plan = String(userRow?.white_label_plan || "").toLowerCase();
      const status = String(userRow?.white_label_subscription_status || "").toLowerCase();
      const countryIso2 = String(userRow?.country_iso2 || "").toUpperCase();
      const currencyCode = String(userRow?.currency_code || "").toUpperCase();
      const host = String(req.headers.get("x-forwarded-host") || req.headers.get("host") || "");
      const isLocalHost = /(^|:)(localhost|127\.0\.0\.1)$/i.test(host) || host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
      const allowLocal = process.env.NODE_ENV !== "production" || isLocalHost;
      const email = String(userRow?.email || "").trim();
      const exemptActive = email ? Boolean(await findActiveWhiteLabelExemption(conn, email)) : false;

      if (!allowLocal && !eligible.has(countryIso2)) {
        return NextResponse.json(
          { ok: false, code: "subscription_unavailable", error: "Insights are not available in your country." },
          { status: 403 }
        );
      }

      let shouldIncrementInsights = false;
      if (!allowLocal) {
        const nextBilling = userRow?.white_label_next_billing_at
          ? new Date(userRow.white_label_next_billing_at)
          : null;
        const paidThrough = nextBilling ? new Date() <= nextBilling : false;
        const subscriptionActive =
          (plan === "paid" && status === "active") ||
          (plan === "paid" && status === "cancelled" && paidThrough) ||
          exemptActive;
        const now = new Date();
        let trialEnds = userRow?.white_label_trial_ends_at ? new Date(userRow.white_label_trial_ends_at) : null;
        if (!trialEnds && trialDays > 0) {
          const next = new Date();
          next.setDate(next.getDate() + trialDays);
          trialEnds = next;
          await conn.query(
            `UPDATE users SET white_label_trial_ends_at = ? WHERE id = ? LIMIT 1`,
            [trialEnds, user.id]
          );
        }
        const trialActive = trialEnds ? now <= trialEnds : false;

        if (!subscriptionActive && !trialActive) {
          return NextResponse.json(
            { ok: false, code: "subscription_required", error: "Paid subscription required." },
            { status: 402 }
          );
        }

        if (!subscriptionActive && trialActive) {
          const todayKey = now.toISOString().slice(0, 10);
          const insightsDate = userRow?.white_label_insights_date
            ? String(userRow.white_label_insights_date).slice(0, 10)
            : null;
          let insightsUsed = Number(userRow?.white_label_insights_used || 0);
          if (insightsDate !== todayKey) {
            insightsUsed = 0;
            await conn.query(
              `UPDATE users SET white_label_insights_date = ?, white_label_insights_used = 0 WHERE id = ? LIMIT 1`,
              [todayKey, user.id]
            );
          }
          if (insightsUsed >= dailyInsightsLimit) {
            return NextResponse.json(
              { ok: false, code: "insights_limit_reached", error: "Daily insights limit reached." },
              { status: 429 }
            );
          }
          shouldIncrementInsights = true;
        }
      }

      await ensureWhiteLabelLandedCostTable(conn);

      const [[product]]: any = await conn.query(
        `
        SELECT id,
               product_name, category, short_desc, image_url,
               amazon_uk_price_current, amazon_uk_price_avg30, amazon_uk_price_avg90, amazon_uk_price_min, amazon_uk_price_max, amazon_uk_offer_count,
               amazon_uk_price_low, amazon_uk_price_high, amazon_uk_last_checked_at,
               amazon_ca_price_current, amazon_ca_price_avg30, amazon_ca_price_avg90, amazon_ca_price_min, amazon_ca_price_max, amazon_ca_offer_count,
               amazon_ca_price_low, amazon_ca_price_high, amazon_ca_last_checked_at,
               amazon_us_price_current, amazon_us_price_avg30, amazon_us_price_avg90, amazon_us_price_min, amazon_us_price_max, amazon_us_offer_count,
               amazon_us_price_low, amazon_us_price_high, amazon_us_last_checked_at,
        FROM linescout_white_label_products
        WHERE id = ?
        LIMIT 1
        `,
        [productId]
      );
      if (!product?.id) {
        return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
      }
      if (shouldIncrementInsights) {
        await conn.query(
          `UPDATE users SET white_label_insights_used = white_label_insights_used + 1 WHERE id = ? LIMIT 1`,
          [user.id]
        );
      }

      const countryMarketplace = userRow?.country_marketplace || null;
      const amazonEnabled = userRow?.amazon_enabled === 1;
      if (!amazonEnabled || !isKeepaMarketplaceSupported(countryMarketplace)) {
        return NextResponse.json(
          { ok: false, code: "subscription_unavailable", error: "Amazon comparison is not available in your country." },
          { status: 403 }
        );
      }

      const preferredMarket = resolveAmazonMarketplace({
        marketplace: countryMarketplace,
        countryIso2,
        currencyCode,
      });
      const caHas =
        product.amazon_ca_price_current != null ||
        product.amazon_ca_price_avg30 != null ||
        product.amazon_ca_price_avg90 != null ||
        product.amazon_ca_price_low != null ||
        product.amazon_ca_price_high != null ||
        product.amazon_ca_price_min != null ||
        product.amazon_ca_price_max != null;
      const usHas =
        product.amazon_us_price_current != null ||
        product.amazon_us_price_avg30 != null ||
        product.amazon_us_price_avg90 != null ||
        product.amazon_us_price_low != null ||
        product.amazon_us_price_high != null ||
        product.amazon_us_price_min != null ||
        product.amazon_us_price_max != null;
      const ukHas =
        product.amazon_uk_price_current != null ||
        product.amazon_uk_price_avg30 != null ||
        product.amazon_uk_price_avg90 != null ||
        product.amazon_uk_price_low != null ||
        product.amazon_uk_price_high != null ||
        product.amazon_uk_price_min != null ||
        product.amazon_uk_price_max != null;

      const market =
        preferredMarket === "US" && usHas
          ? "US"
          : preferredMarket === "CA" && caHas
          ? "CA"
          : preferredMarket === "UK" && ukHas
          ? "UK"
          : ukHas
          ? "UK"
          : caHas
          ? "CA"
          : usHas
          ? "US"
          : preferredMarket;
      const currency = marketplaceCurrency(market);
      const note =
        preferredMarket === "US" && !usHas && ukHas
          ? "Showing UK insights because US data is still syncing."
          : preferredMarket === "CA" && !caHas && ukHas
          ? "Showing UK insights because CA data is still syncing."
          : preferredMarket === "UK" && !ukHas && caHas
          ? "Showing CA insights because UK data is still syncing."
          : null;

      const current = toNum(product[`amazon_${market.toLowerCase()}_price_current`]);
      const avg30 = toNum(product[`amazon_${market.toLowerCase()}_price_avg30`]);
      const avg90 = toNum(product[`amazon_${market.toLowerCase()}_price_avg90`]);
      const minVal = toNum(product[`amazon_${market.toLowerCase()}_price_min`]);
      const maxVal = toNum(product[`amazon_${market.toLowerCase()}_price_max`]);
      const lowVal = toNum(product[`amazon_${market.toLowerCase()}_price_low`]);
      const highVal = toNum(product[`amazon_${market.toLowerCase()}_price_high`]);
      const min = minVal ?? lowVal;
      const max = maxVal ?? highVal;
      const offersRaw = toNum(product[`amazon_${market.toLowerCase()}_offer_count`]);
      const offers = offersRaw != null && offersRaw > 0 ? offersRaw : null;
      const lastChecked = product[`amazon_${market.toLowerCase()}_last_checked_at`] || null;
      const [landedRows]: any = await conn.query(
        `
        SELECT landed_per_unit_low, landed_per_unit_high, currency_code
        FROM linescout_white_label_landed_costs
        WHERE product_id = ? AND country_id = ?
        LIMIT 1
        `,
        [productId, Number(userRow?.country_id || 0)]
      );
      const landedRow = landedRows?.[0] || {};
      const landedCurrency = String(landedRow.currency_code || currencyCode || "").toUpperCase();
      let landedLow = toNum(landedRow.landed_per_unit_low);
      let landedHigh = toNum(landedRow.landed_per_unit_high);
      const marketCurrency = marketplaceCurrency(market);
      if (landedLow != null && landedHigh != null && landedCurrency && marketCurrency && landedCurrency !== marketCurrency) {
        const fx = await getFxRate(conn, landedCurrency, marketCurrency);
        if (fx && Number.isFinite(fx)) {
          landedLow = landedLow * fx;
          landedHigh = landedHigh * fx;
        } else {
          landedLow = null;
          landedHigh = null;
        }
      }

      const trend30 = current && avg30 ? (current - avg30) / avg30 : null;
      const trend90 = current && avg90 ? (current - avg90) / avg90 : null;
      const useMinMax = avg90 && min != null && max != null;
      const volatility = useMinMax ? (max! - min!) / avg90! : null;
      const buyBoxStability =
        volatility == null
          ? null
          : volatility < 0.05
          ? "Stable"
          : volatility < 0.15
          ? "Mixed"
          : "Volatile";

      return NextResponse.json({
        ok: true,
        product: {
          id: product.id,
          name: product.product_name,
          category: product.category,
          short_desc: product.short_desc,
          image_url: product.image_url,
        },
        market,
        currency,
        note,
        metrics: {
          trend_30: pct(trend30),
          trend_90: pct(trend90),
          offer_count: offers,
          seasonality: useMinMax ? pct(volatility) : null,
          buy_box_stability: buyBoxStability,
        },
        raw: {
          price_current: current,
          price_avg30: avg30,
          price_avg90: avg90,
          price_min: minVal,
          price_max: maxVal,
          price_low: lowVal,
          price_high: highVal,
          offer_count: offersRaw,
          last_checked_at: lastChecked,
          landed_per_unit_low: landedLow,
          landed_per_unit_high: landedHigh,
        },
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
