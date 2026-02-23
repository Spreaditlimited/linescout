import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { refreshKeepaProducts } from "@/lib/keepa-refresh";
import { ensureWhiteLabelProductsTable } from "@/lib/white-label-products";

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
  const ids = Array.isArray(body?.ids)
    ? body.ids.map(toId).filter(Boolean)
    : [toId(body?.id)].filter(Boolean);

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Provide ids or id in body" }, { status: 400 });
  }

  const marketplaces = Array.isArray(body?.marketplaces)
    ? body.marketplaces.map((v: any) => String(v).toUpperCase()).filter(Boolean)
    : undefined;

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);

    const [rows]: any = await conn.query(
      `
      SELECT id, product_name, category, amazon_uk_asin, amazon_ca_asin
      FROM linescout_white_label_products
      WHERE id IN (?)
      `,
      [ids]
    );

    const result = await refreshKeepaProducts(conn, rows || [], {
      marketplaces: marketplaces as any,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-products/keepa error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Keepa refresh failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
