import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
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

    return { ok: true as const, userId: Number(rows[0].id), role: String(rows[0].role || "") };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Math.max(5, Math.min(50, limitRaw));

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT
        id,
        amount_kobo,
        currency,
        status,
        requested_note,
        admin_note,
        requested_at,
        approved_at,
        paid_at
      FROM linescout_agent_payout_requests
      WHERE internal_user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [auth.userId, limit]
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}