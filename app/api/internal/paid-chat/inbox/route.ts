import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same internal auth rule as your send endpoint:
 * Admin OR agent with can_view_leads=1
 */
async function requireInternalAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token)
    return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         u.is_active,
         COALESCE(p.can_view_leads, 0) AS can_view_leads
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) {
      return {
        ok: false as const,
        status: 401 as const,
        error: "Invalid session",
      };
    }

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) {
      return { ok: true as const, userId, role };
    }

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/paid-chat/inbox?limit=50&cursor=0
 */
export async function GET(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(10, Math.min(200, limitRaw));
  const cursor = Number(url.searchParams.get("cursor") || 0); // 0 = first page

  const conn = await db.getConnection();
  try {
    const params: any[] = [];

    let where = `
      c.chat_mode = 'paid_human'
      AND c.payment_status = 'paid'
      AND c.project_status = 'active'
    `;

    // Agent view: assigned to me OR unassigned
    if (auth.role !== "admin") {
      where += ` AND (c.assigned_agent_id = ? OR c.assigned_agent_id IS NULL)`;
      params.push(auth.userId);
    }

    // Cursor pagination (older items)
    if (cursor > 0) {
      where += ` AND c.id < ?`;
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `
      SELECT
        c.id,
        c.user_id,
        c.route_type,
        c.chat_mode,
        c.payment_status,
        c.project_status,
        c.assigned_agent_id,
        ia.username AS assigned_agent_username,
        c.updated_at,

        h.id AS handoff_id,
        h.customer_name,
        h.email,
        h.whatsapp_number,

        lm.id AS last_message_id,
        lm.sender_type AS last_sender_type,
        lm.message_text AS last_message_text,
        lm.created_at AS last_message_at

      FROM linescout_conversations c
      LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id

      -- ✅ join internal user for assignment display
      LEFT JOIN internal_users ia ON ia.id = c.assigned_agent_id

      LEFT JOIN (
        SELECT m1.*
        FROM linescout_messages m1
        JOIN (
          SELECT conversation_id, MAX(id) AS max_id
          FROM linescout_messages
          GROUP BY conversation_id
        ) mm ON mm.conversation_id = m1.conversation_id AND mm.max_id = m1.id
      ) lm ON lm.conversation_id = c.id

      WHERE ${where}
      ORDER BY COALESCE(lm.id, 0) DESC, c.updated_at DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    const nextCursor = rows?.length ? Number(rows[rows.length - 1].id) : null;

    return NextResponse.json({
      ok: true,
      items: rows || [],
      next_cursor: nextCursor,
    });
  } finally {
    conn.release();
  }
}