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

      const clauses = ["is_active = 1", "COALESCE(image_url, '') <> ''"];
      const params: any[] = [];

      if (slug) {
        clauses.push(
          "(slug = ? OR REGEXP_REPLACE(LOWER(product_name), '[^a-z0-9]+', '-') = ?)"
        );
        params.push(slug, slug);
      }

      if (!slug && category) {
        clauses.push("category = ?");
        params.push(category);
      }

      if (!slug && q) {
        const like = `%${q}%`;
        clauses.push(
          `(LOWER(product_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ?)`
        );
        params.push(like, like, like);
      }

      const [rows]: any = await conn.query(
        `
        SELECT *
        FROM linescout_white_label_products
        WHERE ${clauses.join(" AND ")}
        ORDER BY sort_order ASC, id DESC
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
