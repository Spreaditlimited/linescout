import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function requireAnalyticsAccess() {
  const cookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME ?? "").trim();
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         COALESCE(p.can_view_analytics, 0) AS can_view_analytics
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const role = String(rows[0].role || "");
    const canAnalytics = role === "admin" || !!rows[0].can_view_analytics;

    if (!canAnalytics) return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, userId: Number(rows[0].id), role };
  } finally {
    conn.release();
  }
}

async function safeScalar(conn: mysql.PoolConnection, sql: string, params: any[] = [], fallback = 0) {
  try {
    const [rows]: any = await conn.query(sql, params);
    const v = rows?.[0] ? Object.values(rows[0])[0] : fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function GET() {
  const auth = await requireAnalyticsAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    // Leads
    const total_leads = await safeScalar(conn, `SELECT COUNT(*) AS n FROM linescout_leads`, [], 0);

    const new_leads = await safeScalar(
      conn,
      `SELECT COUNT(*) AS n FROM linescout_leads WHERE LOWER(status) = 'new'`,
      [],
      0
    );

    const claimed_leads = await safeScalar(
      conn,
      `SELECT COUNT(*) AS n FROM linescout_leads WHERE LOWER(status) = 'claimed'`,
      [],
      0
    );

    const called_leads = await safeScalar(
      conn,
      `SELECT COUNT(*) AS n FROM linescout_leads WHERE LOWER(status) = 'called'`,
      [],
      0
    );

    // Handoffs (best-effort assumptions on statuses)
    const total_handoffs = await safeScalar(conn, `SELECT COUNT(*) AS n FROM linescout_handoffs`, [], 0);

    // "new" = pending (matches what you’ve been using)
    const new_handoffs = await safeScalar(
      conn,
      `SELECT COUNT(*) AS n FROM linescout_handoffs WHERE LOWER(status) = 'pending'`,
      [],
      0
    );

    // "active" = anything not completed/cancelled/closed (safe default)
    const active_handoffs = await safeScalar(
      conn,
      `SELECT COUNT(*) AS n
       FROM linescout_handoffs
       WHERE LOWER(status) NOT IN ('completed','complete','cancelled','canceled','closed')`,
      [],
      0
    );

    /**
     * Unique chat users:
     * If you have a chat sessions/messages table later, we’ll switch to it.
     * For now we do best-effort:
     * 1) Try common chat sessions table names
     * 2) Fallback to distinct lead session_id (at least measures unique lead-origin sessions)
     */
    const unique_chat_users =
      (await safeScalar(
        conn,
        `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_chat_sessions`,
        [],
        -1
      )) !== -1
        ? await safeScalar(conn, `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_chat_sessions`, [], 0)
        : (await safeScalar(
            conn,
            `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_chat_messages`,
            [],
            -1
          )) !== -1
        ? await safeScalar(conn, `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_chat_messages`, [], 0)
        : await safeScalar(conn, `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_leads`, [], 0);

    const unique_leads_users = await safeScalar(
      conn,
      `SELECT COUNT(DISTINCT session_id) AS n FROM linescout_leads`,
      [],
      0
    );

    const lead_conversion_rate =
      unique_chat_users > 0 ? (unique_leads_users / unique_chat_users) * 100 : 0;

    return NextResponse.json({
      ok: true,
      metrics: {
        total_leads,
        new_leads,
        claimed_leads,
        called_leads,

        total_handoffs,
        new_handoffs,
        active_handoffs,

        unique_chat_users,
        unique_leads_users,
        lead_conversion_rate,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to load analytics", details: e?.message || String(e) },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}