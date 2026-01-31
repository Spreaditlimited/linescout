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
 * GET /api/internal/admin/app-users/:id
 * Admin only.
 * Returns:
 * - user summary
 * - sessions (latest 50)
 * - conversations (latest 50)
 * - white label projects (latest 50)
 * - handoffs (latest 50)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const userId = Math.max(1, num(id, 0));
  if (!userId) return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });

  const url = new URL(req.url);
  const sessionsLimit = Math.min(100, Math.max(10, num(url.searchParams.get("sessions_limit"), 50)));
  const conversationsLimit = Math.min(100, Math.max(10, num(url.searchParams.get("conversations_limit"), 50)));
  const wlLimit = Math.min(100, Math.max(10, num(url.searchParams.get("wl_limit"), 50)));
  const handoffsLimit = Math.min(100, Math.max(10, num(url.searchParams.get("handoffs_limit"), 50)));

  const conn = await db.getConnection();
  try {
    // user summary (same aggregates as list page)
    const [uRows]: any = await conn.query(
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

        COALESCE(wAgg.white_label_projects_count, 0) AS white_label_projects_count
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          MAX(last_seen_at) AS last_seen_at,
          MAX(created_at) AS last_session_created_at,
          SUM(CASE WHEN revoked_at IS NULL AND expires_at > NOW() THEN 1 ELSE 0 END) AS active_sessions
        FROM linescout_user_sessions
        WHERE user_id = ?
        GROUP BY user_id
      ) sAgg ON sAgg.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS conversations_count,
          MAX(created_at) AS last_conversation_at
        FROM linescout_conversations
        WHERE user_id = ?
        GROUP BY user_id
      ) cAgg ON cAgg.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) AS white_label_projects_count
        FROM linescout_white_label_projects
        WHERE user_id = ?
        GROUP BY user_id
      ) wAgg ON wAgg.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [userId, userId, userId, userId]
    );

    if (!uRows?.length) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const user = uRows[0];

    const [sessions]: any = await conn.query(
      `
      SELECT
        id,
        user_id,
        created_at,
        expires_at,
        revoked_at,
        last_seen_at,
        user_agent,
        ip_address
      FROM linescout_user_sessions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [userId, sessionsLimit]
    );

    const [conversations]: any = await conn.query(
      `
      SELECT
        id,
        user_id,
        created_at,
        updated_at
      FROM linescout_conversations
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [userId, conversationsLimit]
    );

    const [white_label_projects]: any = await conn.query(
      `
      SELECT
        id,
        user_id,
        status,
        step,
        category,
        product_name,
        quantity_tier,
        branding_level,
        target_landed_cost_naira,
        sourcing_token,
        handoff_id,
        created_at,
        updated_at
      FROM linescout_white_label_projects
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [userId, wlLimit]
    );

    // Handoffs: linked by email OR whatsapp OR token created for WL and machine.
    // We keep it simple and useful: match by email and whatsapp if present, plus any handoff linked by WL handoff_id.
    const email = String(user.email || "").trim();
    const [handoffs]: any = await conn.query(
      `
      SELECT
        h.id,
        h.token,
        h.handoff_type,
        h.status,
        h.email,
        h.customer_name,
        h.whatsapp_number,
        h.claimed_by,
        h.claimed_at,
        h.created_at,
        h.paid_at,
        h.shipped_at,
        h.delivered_at,
        h.cancelled_at
      FROM linescout_handoffs h
      WHERE (h.email = ?)
         OR (h.id IN (
              SELECT DISTINCT handoff_id
              FROM linescout_white_label_projects
              WHERE user_id = ? AND handoff_id IS NOT NULL
            ))
      ORDER BY h.id DESC
      LIMIT ?
      `,
      [email, userId, handoffsLimit]
    );

    return NextResponse.json({
      ok: true,
      user,
      sessions: sessions || [],
      conversations: conversations || [],
      white_label_projects: white_label_projects || [],
      handoffs: handoffs || [],
    });
  } catch (e: any) {
    console.error("GET /api/internal/admin/app-users/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load user details" }, { status: 500 });
  } finally {
    conn.release();
  }
}