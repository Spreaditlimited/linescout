import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsReady,
} from "@/lib/white-label-products";

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
        : `ORDER BY (CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL THEN 1 ELSE 0 END) DESC,
                 COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

      const [[userRow]]: any = await conn.query(
        `
        SELECT c.iso2 AS country_iso2, cur.code AS currency_code
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [auth.id]
      );

      const userCurrency = String(userRow?.currency_code || "").toUpperCase();
      const displayCurrency = userCurrency === "CAD" ? "CAD" : "GBP";
      const displayMarketplace = displayCurrency === "CAD" ? "CA" : "UK";

      const [rows]: any = await conn.query(
        `
        SELECT p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE ${clauses.join(" AND ")}
        ${orderBy}
        LIMIT ${slug ? 1 : 300}
        `,
        params
      );

      const items = (rows || []).map((r: any) => {
        const base = {
          ...r,
          ...computeLandedRange({
            fob_low_usd: r.fob_low_usd,
            fob_high_usd: r.fob_high_usd,
            cbm_per_1000: r.cbm_per_1000,
          }),
        };

        const ukLow = r.amazon_uk_price_low != null ? Number(r.amazon_uk_price_low) : null;
        const ukHigh = r.amazon_uk_price_high != null ? Number(r.amazon_uk_price_high) : null;
        const caLow = r.amazon_ca_price_low != null ? Number(r.amazon_ca_price_low) : null;
        const caHigh = r.amazon_ca_price_high != null ? Number(r.amazon_ca_price_high) : null;
        const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
        const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
        const useCa = displayMarketplace === "CA" && hasCa;
        const useUk = !useCa && hasUk;

        return {
          ...base,
          amazon_display_marketplace: useCa ? "CA" : useUk ? "UK" : null,
          amazon_display_currency: useCa ? "CAD" : useUk ? "GBP" : null,
          amazon_display_price_low: useCa ? caLow : useUk ? ukLow : null,
          amazon_display_price_high: useCa ? caHigh : useUk ? ukHigh : null,
          amazon_display_note:
            displayMarketplace === "CA" && !hasCa && hasUk
              ? "Amazon CA price not available at this time for this product."
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
