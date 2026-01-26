// app/api/internal/paid-chat/send/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal auth:
 * Admin OR agent with can_view_leads=1 (same rule you already use for leads).
 * Returns internal userId + role.
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

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

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
      return { ok: false as const, status: 401 as const, error: "Invalid session" };
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
 * POST /api/internal/paid-chat/send
 * body: { conversation_id: number, message_text: string }
 *
 * Inserts an AGENT message into linescout_messages for a paid conversation.
 * Optional guard: if assigned_agent_id is set, only that agent (or admin) can send.
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const messageText = String(body?.message_text || "").trim();

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  if (!messageText) {
    return NextResponse.json({ ok: false, error: "message_text is required" }, { status: 400 });
  }

  if (messageText.length > 8000) {
    return NextResponse.json({ ok: false, error: "message_text too long" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Ensure this is a paid conversation and still active
    const [convRows]: any = await conn.query(
      `SELECT id, chat_mode, payment_status, project_status, assigned_agent_id
       FROM linescout_conversations
       WHERE id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!convRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = convRows[0];
    const chatMode = String(conv.chat_mode || "");
    const paymentStatus = String(conv.payment_status || "");
    const projectStatus = String(conv.project_status || "");
    const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);

    if (chatMode !== "paid_human" || paymentStatus !== "paid") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (projectStatus === "cancelled") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    // 2) Optional guard: if assigned_agent_id exists, only that agent or admin can send
    if (assignedAgentId && auth.role !== "admin") {
      // internal_users.id is what we have as auth.userId
      if (auth.userId !== assignedAgentId) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "You are not assigned to this conversation." }, { status: 403 });
      }
    }

    // 3) Insert agent message
    const [ins]: any = await conn.query(
      `INSERT INTO linescout_messages
         (conversation_id, sender_type, sender_id, message_text)
       VALUES
         (?, 'agent', ?, ?)`,
      [conversationId, auth.userId, messageText]
    );

    const messageId = Number(ins?.insertId || 0);

    // 4) Touch conversation updated_at
    await conn.query(
      `UPDATE linescout_conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [conversationId]
    );

    // 5) Return inserted message
    const [rows]: any = await conn.query(
      `SELECT id, conversation_id, sender_type, sender_id, message_text, created_at
       FROM linescout_messages
       WHERE id = ?
       LIMIT 1`,
      [messageId]
    );

    await conn.commit();

    return NextResponse.json({ ok: true, item: rows?.[0] || null });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/send error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to send agent message" }, { status: 500 });
  } finally {
    conn.release();
  }
}