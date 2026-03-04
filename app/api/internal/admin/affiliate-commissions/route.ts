import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureAffiliateTables } from "@/lib/affiliates";

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

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT id, transaction_type, mode, value, currency, is_active, updated_at
      FROM linescout_affiliate_commission_rules
      ORDER BY transaction_type ASC
      `
    );
    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const transactionType = String(body?.transaction_type || "").trim();
  const mode = String(body?.mode || "percent").trim().toLowerCase();
  const value = Number(body?.value || 0);
  const currency = body?.currency ? String(body.currency).trim().toUpperCase() : null;
  const isActive = body?.is_active === false ? 0 : 1;

  if (!transactionType) {
    return NextResponse.json({ ok: false, error: "transaction_type is required" }, { status: 400 });
  }
  if (mode !== "percent" && mode !== "flat") {
    return NextResponse.json({ ok: false, error: "mode must be percent or flat" }, { status: 400 });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ ok: false, error: "value must be greater than 0" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await conn.query(
      `
      INSERT INTO linescout_affiliate_commission_rules
        (transaction_type, mode, value, currency, is_active)
      VALUES
        (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        mode = VALUES(mode),
        value = VALUES(value),
        currency = VALUES(currency),
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP
      `,
      [transactionType, mode, value, currency, isActive]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to update commission rules");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}

