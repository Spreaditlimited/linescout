import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { findActiveWhiteLabelExemption } from "@/lib/white-label-exemptions";
import { resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";
import { fetchKeepaProductDetails, searchKeepaAsin } from "@/lib/keepa";
import { getFreshKeepaSnapshot, saveKeepaSnapshot } from "@/lib/keepa-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function buildSearchTerms(name: string, category: string) {
  const trimmedName = String(name || "").trim();
  const trimmedCategory = String(category || "").trim();
  const terms = new Set<string>();
  if (trimmedName && trimmedCategory) terms.add(`${trimmedName} ${trimmedCategory}`);
  if (trimmedName) terms.add(trimmedName);
  if (trimmedCategory && trimmedName) {
    const cleanedCategory = trimmedCategory.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (cleanedCategory) terms.add(`${trimmedName} ${cleanedCategory}`);
  }
  return Array.from(terms);
}

function toNum(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function keepaMinutesToMs(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return (value + 21564000) * 60000;
}

function summarizeOffers(offers: any[]) {
  if (!Array.isArray(offers) || offers.length === 0) return null;
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  let total = 0;
  let recent = 0;
  let prime = 0;
  let fba = 0;
  let amazon = 0;
  let warehouse = 0;
  let primeExcl = 0;
  let preorder = 0;
  let shippable = 0;
  let mapRestricted = 0;
  const sellerIds = new Set<string>();

  for (const offer of offers) {
    total += 1;
    if (offer?.isPrime) prime += 1;
    if (offer?.isFBA) fba += 1;
    if (offer?.isAmazon) amazon += 1;
    if (offer?.isWarehouseDeal) warehouse += 1;
    if (offer?.isPrimeExcl) primeExcl += 1;
    if (offer?.isPreorder) preorder += 1;
    if (offer?.isShippable) shippable += 1;
    if (offer?.isMAP) mapRestricted += 1;
    if (offer?.sellerId) sellerIds.add(String(offer.sellerId));
    const lastSeenMs = keepaMinutesToMs(toNum(offer?.lastSeen));
    if (lastSeenMs && now - lastSeenMs <= thirtyDaysMs) {
      recent += 1;
    }
  }

  const fbm = Math.max(0, total - fba - amazon);
  return {
    total_offers: total,
    recent_offers_30d: recent,
    prime_offers: prime,
    fba_offers: fba,
    fbm_offers: fbm,
    amazon_offers: amazon,
    warehouse_deals: warehouse,
    prime_exclusive_offers: primeExcl,
    preorder_offers: preorder,
    shippable_offers: shippable,
    map_restricted_offers: mapRestricted,
    unique_sellers: sellerIds.size,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.product_id || 0);
    const mode = String(body?.mode || "full").toLowerCase();
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
      const isLocalHost =
        /(^|:)(localhost|127\\.0\\.0\\.1)$/i.test(host) ||
        host.startsWith("localhost:") ||
        host.startsWith("127.0.0.1:");
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
               amazon_uk_asin, amazon_ca_asin, amazon_us_asin
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
      const market = preferredMarket;
      const asinKey =
        market === "US" ? "amazon_us_asin" : market === "CA" ? "amazon_ca_asin" : "amazon_uk_asin";
      let asin = product[asinKey] || null;

      const source = mode === "offers" ? "insights_offers" : "insights_full";
      const cached = await getFreshKeepaSnapshot(conn, productId, market, CACHE_TTL_MS, source);
      if (cached?.raw_json) {
        const parsed = JSON.parse(cached.raw_json || "{}");
        const keepaProduct = parsed?.products?.[0] || null;
        const stats = keepaProduct?.stats || null;
        const offerSummary = mode === "offers" ? summarizeOffers(keepaProduct?.offers || []) : null;
        return NextResponse.json({
          ok: true,
          cached: true,
          market,
          asin: cached.asin || asin,
          fetched_at: cached.fetched_at,
          summary: {
            offers_total: toNum(stats?.totalOfferCount ?? stats?.offerCount ?? keepaProduct?.offerCount ?? null),
            sales_rank_drops_30: toNum(keepaProduct?.salesRankDrops30 ?? null),
            sales_rank_drops_90: toNum(keepaProduct?.salesRankDrops90 ?? null),
            sales_rank_drops_180: toNum(keepaProduct?.salesRankDrops180 ?? null),
            sales_rank_drops_365: toNum(keepaProduct?.salesRankDrops365 ?? null),
          },
          offer_summary: offerSummary,
          raw: parsed,
        });
      }

      if (!asin) {
        const terms = buildSearchTerms(product.product_name, product.category);
        for (const term of terms) {
          asin = await searchKeepaAsin(term, market);
          if (asin) break;
        }
        if (asin) {
          await conn.query(
            `UPDATE linescout_white_label_products SET ${asinKey} = ? WHERE id = ? LIMIT 1`,
            [asin, productId]
          );
        }
      }

      if (!asin) {
        return NextResponse.json(
          { ok: false, error: "No matching ASIN found for this marketplace." },
          { status: 404 }
        );
      }

      const payload = await fetchKeepaProductDetails(asin, market, {
        history: 1,
        rating: 1,
        offers: mode === "offers" ? 20 : undefined,
      });
      if (!payload) {
        return NextResponse.json({ ok: false, error: "Market data request failed." }, { status: 502 });
      }
      await saveKeepaSnapshot(conn, productId, market, asin, source, payload);
      const keepaProduct = payload?.products?.[0] || null;
      const stats = keepaProduct?.stats || null;
      const offerSummary = mode === "offers" ? summarizeOffers(keepaProduct?.offers || []) : null;

      return NextResponse.json({
        ok: true,
        cached: false,
        market,
        asin,
        fetched_at: new Date().toISOString(),
        summary: {
          offers_total: toNum(stats?.totalOfferCount ?? stats?.offerCount ?? keepaProduct?.offerCount ?? null),
          sales_rank_drops_30: toNum(keepaProduct?.salesRankDrops30 ?? null),
          sales_rank_drops_90: toNum(keepaProduct?.salesRankDrops90 ?? null),
          sales_rank_drops_180: toNum(keepaProduct?.salesRankDrops180 ?? null),
          sales_rank_drops_365: toNum(keepaProduct?.salesRankDrops365 ?? null),
        },
        offer_summary: offerSummary,
        raw: payload,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Market data error" }, { status: 500 });
  }
}
