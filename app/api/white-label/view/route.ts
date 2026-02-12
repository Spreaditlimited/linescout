import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.product_id || 0);
    const slug = String(body?.slug || "").trim();

    if (!productId && !slug) {
      return NextResponse.json({ ok: false, error: "Missing product_id or slug" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelProductsReady(conn);

      let resolvedId = productId;
      if (!resolvedId && slug) {
        const [rows]: any = await conn.query(
          `
          SELECT id
          FROM linescout_white_label_products
          WHERE slug = ?
          LIMIT 1
          `,
          [slug]
        );
        resolvedId = Number(rows?.[0]?.id || 0);
      }

      if (!resolvedId) {
        return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
      }

      await conn.query(
        `INSERT INTO linescout_white_label_views (product_id) VALUES (?)`,
        [resolvedId]
      );

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
