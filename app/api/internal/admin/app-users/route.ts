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
 * GET /api/internal/admin/app-users?page=1&page_size=25
 * Admin only.
 * Lists LineScout user-app users from `users` table, with:
 * - sessions (linescout_user_sessions)
 * - conversations (linescout_conversations)
 * - white label workflow count (linescout_white_label_projects)
 * - projects from handoffs (linescout_handoffs): machine sourcing + total + last_project_at
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
    const [totalRows]: any = await conn.query(`SELECT COUNT(*) AS total FROM users`);
    const total = Number(totalRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.created_at,

        COALESCE(sAgg.last_seen_at, NULL) AS last_seen_at,
        COALESCE(sAgg.last_session_created_at, NULL) AS last_session_created_at,
        COALESCE(sAgg.active_sessions, 0) AS active_sessions,

        COALESCE(cAgg.conversations_count, 0) AS conversations_count,
        COALESCE(cAgg.last_conversation_at, NULL) AS last_conversation_at,

        COALESCE(wAgg.white_label_projects_count, 0) AS white_label_projects_count,

        -- Projects (source of truth = handoffs)
        COALESCE(hAgg.machine_sourcing_projects_count, 0) AS machine_sourcing_projects_count,
        COALESCE(hAgg.total_projects_count, 0) AS total_projects_count,
        COALESCE(hAgg.last_project_at, NULL) AS last_project_at

      FROM users u

      LEFT JOIN (
        SELECT
          user_id,
          MAX(last_seen_at) AS last_seen_at,
          MAX(created_at) AS last_session_created_at,
          SUM(CASE WHEN revoked_at IS NULL AND expires_at > NOW() THEN 1 ELSE 0 END) AS active_sessions
        FROM linescout_user_sessions
        GROUP BY user_id
      ) sAgg ON sAgg.user_id = u.id

      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS conversations_count,
          MAX(created_at) AS last_conversation_at
        FROM linescout_conversations
        GROUP BY user_id
      ) cAgg ON cAgg.user_id = u.id

      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS white_label_projects_count
        FROM linescout_white_label_projects
        GROUP BY user_id
      ) wAgg ON wAgg.user_id = u.id

      LEFT JOIN (
        -- Link handoffs to users by normalized email.
        -- Machine sourcing = anything not white_label.
        SELECT
          LOWER(TRIM(email)) AS email_norm,
          SUM(CASE WHEN handoff_type IS NOT NULL AND handoff_type <> 'white_label' THEN 1 ELSE 0 END) AS machine_sourcing_projects_count,
          COUNT(*) AS total_projects_count,
          MAX(created_at) AS last_project_at
        FROM linescout_handoffs
        WHERE email IS NOT NULL AND TRIM(email) <> ''
        GROUP BY LOWER(TRIM(email))
      ) hAgg ON hAgg.email_norm = u.email_normalized

      ORDER BY u.id DESC
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
    console.error("GET /api/internal/admin/app-users error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load users" }, { status: 500 });
  } finally {
    conn.release();
  }
}