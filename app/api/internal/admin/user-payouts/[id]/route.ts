import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
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
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const id = Number(parts[parts.length - 1] || 0);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         pr.id,
         pr.user_id,
         pr.amount,
         pr.status,
         pr.rejection_reason,
         pr.approved_at,
         pr.paid_at,
         pr.created_at,
         u.email,
         u.display_name,
         uba.bank_code,
         uba.account_number,
         uba.status AS bank_status,
         uba.verified_at AS bank_verified_at
       FROM linescout_user_payout_requests pr
       JOIN users u ON u.id = pr.user_id
       LEFT JOIN linescout_user_payout_accounts uba ON uba.user_id = pr.user_id
       WHERE pr.id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, item: rows[0] });
  } finally {
    conn.release();
  }
}
