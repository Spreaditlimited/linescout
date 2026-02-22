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
    await requireUser(req);

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
        : `ORDER BY (CASE WHEN p.amazon_price_low IS NOT NULL OR p.amazon_price_high IS NOT NULL THEN 1 ELSE 0 END) DESC,
                 COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

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

      const items = (rows || []).map((r: any) => ({
        ...r,
        ...computeLandedRange({
          fob_low_usd: r.fob_low_usd,
          fob_high_usd: r.fob_high_usd,
          cbm_per_1000: r.cbm_per_1000,
        }),
      }));

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
