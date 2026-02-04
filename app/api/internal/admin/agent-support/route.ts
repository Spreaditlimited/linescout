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
  const cookieHeader = h.get("cookie") || "";
  const token =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Admin access required" };
    return { ok: true as const, userId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") || "pending").trim().toLowerCase();
  const allowed = new Set(["pending", "reviewed", "resolved", "all"]);
  const filter = allowed.has(status) ? status : "pending";

  const conn = await db.getConnection();
  try {
    const params: any[] = [];
    const where = filter === "all" ? "" : "WHERE r.status = ?";
    if (filter !== "all") params.push(filter);

    const [rows]: any = await conn.query(
      `
      SELECT
        r.id,
        r.internal_user_id,
        r.subject,
        r.message,
        r.status,
        r.admin_response_channel,
        r.admin_note,
        r.created_at,
        r.updated_at,
        iu.username,
        p.first_name,
        p.last_name,
        p.email,
        p.china_phone
      FROM linescout_agent_support_requests r
      JOIN internal_users iu ON iu.id = r.internal_user_id
      LEFT JOIN linescout_agent_profiles p ON p.internal_user_id = r.internal_user_id
      ${where}
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END,
        r.id DESC
      LIMIT 500
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    if (String(e?.message || "").toLowerCase().includes("doesn't exist")) {
      return NextResponse.json({ ok: true, items: [] });
    }
    throw e;
  } finally {
    conn.release();
  }
}
