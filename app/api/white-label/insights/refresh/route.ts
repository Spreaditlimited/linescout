import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { refreshKeepaProducts } from "@/lib/keepa-refresh";
import { findActiveWhiteLabelExemption } from "@/lib/white-label-exemptions";
import { resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function isFresh(lastChecked?: string | null) {
  if (!lastChecked) return false;
  const ts = Date.parse(String(lastChecked));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < REFRESH_TTL_MS;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.product_id || 0);
    if (!productId || !Number.isFinite(productId)) {
      return NextResponse.json({ ok: false, error: "Missing product_id" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelSettings(conn);
      await ensureWhiteLabelUserColumns(conn);
      await ensureWhiteLabelProductsReady(conn);

      const [[settings]]: any = await conn.query(
        `SELECT white_label_subscription_countries, white_label_trial_days
         FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const eligible = new Set(parseEligibleCountries(settings?.white_label_subscription_countries));
      const trialDays = Number(settings?.white_label_trial_days || 0);

      const [[userRow]]: any = await conn.query(
        `
        SELECT u.white_label_plan, u.white_label_subscription_status,
               u.white_label_trial_ends_at,
               u.email,
               u.white_label_next_billing_at,
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

      if (!userRow?.amazon_enabled || !isKeepaMarketplaceSupported(userRow?.country_marketplace)) {
        return NextResponse.json(
          { ok: false, code: "subscription_unavailable", error: "Amazon comparison is not available in your country." },
          { status: 403 }
        );
      }

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
      }

      const [[product]]: any = await conn.query(
        `
        SELECT id,
               product_name, category,
               amazon_uk_asin, amazon_ca_asin, amazon_us_asin,
               amazon_uk_last_checked_at, amazon_ca_last_checked_at, amazon_us_last_checked_at,
               amazon_uk_price_current, amazon_uk_price_avg30, amazon_uk_price_avg90,
               amazon_uk_price_min, amazon_uk_price_max, amazon_uk_offer_count,
               amazon_ca_price_current, amazon_ca_price_avg30, amazon_ca_price_avg90,
               amazon_ca_price_min, amazon_ca_price_max, amazon_ca_offer_count,
               amazon_us_price_current, amazon_us_price_avg30, amazon_us_price_avg90,
               amazon_us_price_min, amazon_us_price_max, amazon_us_offer_count,
               amazon_uk_price_low, amazon_uk_price_high,
               amazon_ca_price_low, amazon_ca_price_high,
               amazon_us_price_low, amazon_us_price_high
        FROM linescout_white_label_products
        WHERE id = ?
        LIMIT 1
        `,
        [productId]
      );
      if (!product?.id) {
        return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
      }

      const preferredMarket = resolveAmazonMarketplace({
        marketplace: userRow?.country_marketplace,
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
      const lastChecked =
        market === "CA"
          ? product.amazon_ca_last_checked_at
          : market === "US"
          ? product.amazon_us_last_checked_at
          : product.amazon_uk_last_checked_at;
      const marketDataComplete =
        market === "CA"
          ? product.amazon_ca_price_current != null &&
            product.amazon_ca_price_avg30 != null &&
            product.amazon_ca_price_avg90 != null &&
            (product.amazon_ca_price_min != null ||
              (product.amazon_ca_price_low != null && product.amazon_ca_price_high != null))
          : market === "US"
          ? product.amazon_us_price_current != null &&
            product.amazon_us_price_avg30 != null &&
            product.amazon_us_price_avg90 != null &&
            (product.amazon_us_price_min != null ||
              (product.amazon_us_price_low != null && product.amazon_us_price_high != null))
          : product.amazon_uk_price_current != null &&
            product.amazon_uk_price_avg30 != null &&
            product.amazon_uk_price_avg90 != null &&
            (product.amazon_uk_price_min != null ||
              (product.amazon_uk_price_low != null && product.amazon_uk_price_high != null));

      if (marketDataComplete && isFresh(lastChecked)) {
        return NextResponse.json({
          ok: true,
          refreshed: false,
          reason: "fresh",
          market,
          complete: true,
        });
      }

      const result = await refreshKeepaProducts(conn, [product], {
        allowSearch: true,
        marketplaces: [market],
        maxProducts: 1,
      });

      return NextResponse.json({
        ok: true,
        refreshed: result.updated > 0,
        market,
        complete: marketDataComplete,
        result,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
