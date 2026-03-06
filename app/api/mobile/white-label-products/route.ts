import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { marketplaceCurrency, resolveAmazonMarketplace } from "@/lib/white-label-marketplace";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import { getFxRate } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);

    const url = new URL(req.url);
    const category = String(url.searchParams.get("category") || "").trim();
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const slug = String(url.searchParams.get("slug") || "").trim().toLowerCase();

    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelProductsReady(conn);
      await ensureWhiteLabelLandedCostTable(conn);

      const clauses = ["p.is_active = 1", "COALESCE(p.image_url, '') <> ''"];
      const params: any[] = [];

      if (slug) {
        clauses.push(
          "(p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?)"
        );
        params.push(slug, slug);
      }

      if (!slug && category) {
        clauses.push("p.category = ?");
        params.push(category);
      }

      if (!slug && q) {
        const like = `%${q}%`;
        clauses.push(
          `(LOWER(p.product_name) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(COALESCE(p.short_desc,'')) LIKE ?)`
        );
        params.push(like, like, like);
      }

      const orderBy = slug
        ? "ORDER BY p.id DESC"
        : `ORDER BY (CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END) DESC,
                 COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

      const [[userRow]]: any = await conn.query(
        `
        SELECT c.id AS country_id, c.iso2 AS country_iso2, c.amazon_marketplace AS country_marketplace, cur.code AS currency_code
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [auth.id]
      );

      const userCurrency = String(userRow?.currency_code || "").toUpperCase();
      const displayMarketplace = resolveAmazonMarketplace({
        marketplace: userRow?.country_marketplace,
        countryIso2: userRow?.country_iso2,
        currencyCode: userCurrency,
      });

      const [rows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count,
               lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
        FROM linescout_white_label_products p
        LEFT JOIN linescout_white_label_landed_costs lc
          ON lc.product_id = p.id AND lc.country_id = ?
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE ${clauses.join(" AND ")}
        ${orderBy}
        LIMIT ${slug ? 1 : 300}
        `,
        [Number(userRow?.country_id || 0), ...params]
      );

      const amazonCurrency = marketplaceCurrency(displayMarketplace);
      const amazonFx =
        userCurrency === amazonCurrency ? 1 : await getFxRate(conn, userCurrency, amazonCurrency);

      const items = (rows || []).map((r: any) => {
        const landedLow = r.landed_per_unit_low != null ? Number(r.landed_per_unit_low) : null;
        const landedHigh = r.landed_per_unit_high != null ? Number(r.landed_per_unit_high) : null;
        const base = {
          ...r,
          landed_per_unit_low: landedLow,
          landed_per_unit_high: landedHigh,
          landed_total_1000_low: r.landed_total_1000_low ?? null,
          landed_total_1000_high: r.landed_total_1000_high ?? null,
          landed_currency_code: userCurrency,
          amazon_landed_per_unit_low: landedLow != null && amazonFx ? landedLow * amazonFx : null,
          amazon_landed_per_unit_high: landedHigh != null && amazonFx ? landedHigh * amazonFx : null,
        };

        const ukLow = r.amazon_uk_price_low != null ? Number(r.amazon_uk_price_low) : null;
        const ukHigh = r.amazon_uk_price_high != null ? Number(r.amazon_uk_price_high) : null;
        const caLow = r.amazon_ca_price_low != null ? Number(r.amazon_ca_price_low) : null;
        const caHigh = r.amazon_ca_price_high != null ? Number(r.amazon_ca_price_high) : null;
        const usLow = r.amazon_us_price_low != null ? Number(r.amazon_us_price_low) : null;
        const usHigh = r.amazon_us_price_high != null ? Number(r.amazon_us_price_high) : null;
        const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
        const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
        const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);
        const useUs = displayMarketplace === "US" && hasUs;
        const useCa = displayMarketplace === "CA" && hasCa;
        const useUk = displayMarketplace === "UK" && hasUk;
        const fallbackMarket = hasUk ? "UK" : hasCa ? "CA" : hasUs ? "US" : null;
        const market = useUs ? "US" : useCa ? "CA" : useUk ? "UK" : fallbackMarket;

        return {
          ...base,
          amazon_display_marketplace: market,
          amazon_display_currency: market ? marketplaceCurrency(market) : null,
          amazon_display_price_low: market === "US" ? usLow : market === "CA" ? caLow : market === "UK" ? ukLow : null,
          amazon_display_price_high: market === "US" ? usHigh : market === "CA" ? caHigh : market === "UK" ? ukHigh : null,
          amazon_display_note:
            displayMarketplace === "US" && !hasUs && hasUk
              ? "Amazon US price not available at this time for this product."
              : displayMarketplace === "CA" && !hasCa && hasUk
              ? "Amazon CA price not available at this time for this product."
              : displayMarketplace === "UK" && !hasUk && hasCa
              ? "Amazon UK price not available at this time for this product."
              : null,
        };
      });

      if (slug) {
        const item = items?.[0] || null;
        if (!item) {
          return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true, item, items: [item] });
      }

      return NextResponse.json({ ok: true, items });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
