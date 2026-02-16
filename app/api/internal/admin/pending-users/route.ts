import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/admin/pending-users?page=1&page_size=25
 * Admin only.
 * Lists pending users who have requested OTPs but have not verified.
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = Math.max(1, num(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, num(url.searchParams.get("page_size"), 25)));
  const offset = (page - 1) * pageSize;

  const conn = await db.getConnection();
  try {
    const [totalRows]: any = await conn.query(`SELECT COUNT(*) AS total FROM pending_users`);
    const total = Number(totalRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT
        p.id,
        p.email,
        p.created_at,
        COALESCE(oAgg.otp_requests, 0) AS otp_requests,
        oAgg.last_otp_at
      FROM pending_users p
      LEFT JOIN (
        SELECT
          pending_user_id,
          COUNT(*) AS otp_requests,
          MAX(created_at) AS last_otp_at
        FROM email_otps
        WHERE pending_user_id IS NOT NULL
        GROUP BY pending_user_id
      ) oAgg ON oAgg.pending_user_id = p.id
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    return NextResponse.json({
      ok: true,
      page,
      page_size: pageSize,
      total,
      items: rows || [],
    });
  } catch (e: any) {
    console.error("GET /api/internal/admin/pending-users error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load pending users" }, { status: 500 });
  } finally {
    conn.release();
  }
}
