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

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id || 0);
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, status FROM linescout_user_payout_requests WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (rows[0].status !== "approved") {
      return NextResponse.json({ ok: false, error: "Only approved requests can be marked paid" }, { status: 400 });
    }

    await conn.query(
      `UPDATE linescout_user_payout_requests
       SET status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
