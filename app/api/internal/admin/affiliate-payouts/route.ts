import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

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

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "pending").trim();
  const allowed = new Set(["pending", "approved", "rejected", "paid", "failed"]);
  const statusFilter = allowed.has(status) ? status : "pending";

  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(10, Math.min(200, limitRaw));
  const cursor = Number(url.searchParams.get("cursor") || 0);

  const conn = await db.getConnection();
  try {
    const params: any[] = [statusFilter];
    let where = `r.status = ?`;
    if (cursor > 0) {
      where += ` AND r.id < ?`;
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `
      SELECT
        r.id,
        r.affiliate_id,
        r.amount,
        r.currency,
        r.status,
        r.requested_note,
        r.admin_note,
        r.requested_at,
        r.approved_at,
        r.paid_at,
        r.paystack_transfer_code,
        r.paystack_reference,
        r.paypal_payout_id,

        a.email,
        a.name,
        a.referral_code,
        a.country_id,
        a.payout_currency,

        pa.provider,
        pa.provider_account,
        pa.status AS payout_status,
        pa.verified_at AS payout_verified_at

      FROM linescout_affiliate_payout_requests r
      JOIN linescout_affiliates a ON a.id = r.affiliate_id
      LEFT JOIN linescout_affiliate_payout_accounts pa ON pa.affiliate_id = r.affiliate_id

      WHERE ${where}
      ORDER BY r.id DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    const nextCursor = rows?.length ? Number(rows[rows.length - 1].id) : null;

    return NextResponse.json({ ok: true, status: statusFilter, items: rows || [], next_cursor: nextCursor });
  } finally {
    conn.release();
  }
}

