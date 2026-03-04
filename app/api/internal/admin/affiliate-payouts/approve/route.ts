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

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const payoutRequestId = Number(body?.payout_request_id || 0);
  if (!payoutRequestId) {
    return NextResponse.json({ ok: false, error: "payout_request_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, status FROM linescout_affiliate_payout_requests WHERE id = ? LIMIT 1`,
      [payoutRequestId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Payout request not found" }, { status: 404 });
    }

    const status = String(rows[0].status || "");
    if (status !== "pending") {
      return NextResponse.json({ ok: false, error: `Cannot approve a ${status} request` }, { status: 409 });
    }

    await conn.query(
      `
      UPDATE linescout_affiliate_payout_requests
      SET status = 'approved', approved_at = NOW(), updated_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [payoutRequestId]
    );

    return NextResponse.json({ ok: true, payout_request_id: payoutRequestId, status: "approved" });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to approve payout request");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}

