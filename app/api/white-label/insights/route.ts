import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";

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
               c.iso2 AS country_iso2,
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

      if (!allowLocal && !eligible.has(countryIso2)) {
        return NextResponse.json(
          { ok: false, code: "subscription_unavailable", error: "Insights are not available in your country." },
          { status: 403 }
        );
      }

      let shouldIncrementInsights = false;
      if (!allowLocal) {
        const subscriptionActive = plan === "paid" && status === "active";
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

      const [[product]]: any = await conn.query(
        `
        SELECT id,
               product_name, category, short_desc, image_url,
               amazon_uk_price_current, amazon_uk_price_avg30, amazon_uk_price_avg90, amazon_uk_price_min, amazon_uk_price_max, amazon_uk_offer_count,
               amazon_ca_price_current, amazon_ca_price_avg30, amazon_ca_price_avg90, amazon_ca_price_min, amazon_ca_price_max, amazon_ca_offer_count
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

      const isCad = currencyCode === "CAD";
      const caHas =
        product.amazon_ca_price_current != null ||
        product.amazon_ca_price_avg30 != null ||
        product.amazon_ca_price_avg90 != null;
      const ukHas =
        product.amazon_uk_price_current != null ||
        product.amazon_uk_price_avg30 != null ||
        product.amazon_uk_price_avg90 != null;

      const market = isCad && caHas ? "CA" : "UK";
      const currency = market === "CA" ? "CAD" : "GBP";
      const note = isCad && !caHas && ukHas ? "Showing UK insights because CA data is still syncing." : null;

      const current = Number(product[`amazon_${market.toLowerCase()}_price_current`] || 0) || null;
      const avg30 = Number(product[`amazon_${market.toLowerCase()}_price_avg30`] || 0) || null;
      const avg90 = Number(product[`amazon_${market.toLowerCase()}_price_avg90`] || 0) || null;
      const min = Number(product[`amazon_${market.toLowerCase()}_price_min`] || 0) || null;
      const max = Number(product[`amazon_${market.toLowerCase()}_price_max`] || 0) || null;
      const offers = Number(product[`amazon_${market.toLowerCase()}_offer_count`] || 0) || null;

      const trend30 = current && avg30 ? (current - avg30) / avg30 : null;
      const trend90 = current && avg90 ? (current - avg90) / avg90 : null;
      const volatility = avg90 && min != null && max != null ? (max - min) / avg90 : null;
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
          seasonality: pct(volatility),
          buy_box_stability: buyBoxStability,
        },
        raw: {
          current,
          avg30,
          avg90,
          min,
          max,
        },
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
