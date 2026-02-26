import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsTable } from "@/lib/white-label-products";
import { fetchKeepaProductRaw, searchKeepaAsin } from "@/lib/keepa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    if (String(rows[0].role || "") !== "admin")
      return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

function toId(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = toId(body?.id);
  const marketplace = String(body?.marketplace || "US").trim().toUpperCase();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Provide id" }, { status: 400 });
  }
  if (!["US", "UK", "CA"].includes(marketplace)) {
    return NextResponse.json({ ok: false, error: "Invalid marketplace" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);
    const [rows]: any = await conn.query(
      `
      SELECT id, product_name, category, amazon_uk_asin, amazon_ca_asin, amazon_us_asin
      FROM linescout_white_label_products
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );
    const product = rows?.[0];
    if (!product) return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });

    const asinKey = marketplace === "US" ? "amazon_us_asin" : marketplace === "CA" ? "amazon_ca_asin" : "amazon_uk_asin";
    let asin = product?.[asinKey] ? String(product[asinKey]).trim() : "";
    let searched = false;
    let searchTerm: string | null = null;

    if (!asin) {
      searched = true;
      searchTerm = `${String(product.product_name || "").trim()} ${String(product.category || "").trim()}`.trim();
      asin = (await searchKeepaAsin(searchTerm, marketplace as any)) || "";
    }

    if (!asin) {
      return NextResponse.json({
        ok: true,
        marketplace,
        searched,
        searchTerm,
        asin: null,
        product: null,
        stats: null,
      });
    }

    const raw = await fetchKeepaProductRaw(asin, marketplace as any);
    const keepaProduct = raw?.products?.[0] || null;
    const stats = keepaProduct?.stats || null;

    return NextResponse.json({
      ok: true,
      marketplace,
      searched,
      searchTerm,
      asin,
      product: keepaProduct,
      stats,
      tokensLeft: raw?.tokensLeft ?? null,
      tokensConsumed: raw?.tokensConsumed ?? null,
      timestamp: raw?.timestamp ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-products/keepa-raw error:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Keepa raw fetch failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
