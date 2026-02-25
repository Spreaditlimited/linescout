import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensurePaidChatMessageColumns } from "@/lib/paid-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSessionToken(req: Request, cookieName: string) {
  const bearer = req.headers.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  return headerToken || cookieToken;
}

async function requireInternalAccess(req: Request) {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const token =
    readSessionToken(req, cookieName) || (await cookies()).get(cookieName)?.value || "";
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         u.username,
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

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;
    const username = String(rows[0].username || "");

    if (role === "admin" || canViewLeads) return { ok: true as const, userId, role, username };

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/paid-chat/delete
 * body: { conversation_id, message_id }
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const messageId = Number(body?.message_id || 0);

  if (!conversationId || !messageId) {
    return NextResponse.json(
      { ok: false, error: "conversation_id and message_id are required" },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await ensurePaidChatMessageColumns(conn);

    const [convRows]: any = await conn.query(
      `SELECT c.id, c.chat_mode, c.payment_status, c.project_status, c.assigned_agent_id, h.claimed_by
       FROM linescout_conversations c
       LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
       WHERE c.id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!convRows?.length) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = convRows[0];
    if (String(conv.chat_mode) !== "paid_human" || String(conv.payment_status) !== "paid") {
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (String(conv.project_status) === "cancelled") {
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    if (auth.role !== "admin") {
      const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);
      const claimedBy = String(conv.claimed_by || "").trim();
      const isAssignedToAgent = !!assignedAgentId && auth.userId === assignedAgentId;
      const isClaimedByAgent = !!claimedBy && !!auth.username && claimedBy === auth.username;
      if (!isAssignedToAgent && !isClaimedByAgent) {
        return NextResponse.json(
          { ok: false, error: "You can read this project, but cannot delete messages." },
          { status: 403 }
        );
      }
    }

    const [mrows]: any = await conn.query(
      `SELECT id, sender_type, sender_id, deleted_at, created_at
       FROM linescout_messages
       WHERE id = ? AND conversation_id = ?
       LIMIT 1`,
      [messageId, conversationId]
    );

    if (!mrows?.length) {
      return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
    }

    const m = mrows[0];
    if (String(m.sender_type) !== "agent" || Number(m.sender_id) !== auth.userId) {
      return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    }

    if (m.deleted_at) {
      return NextResponse.json({ ok: true, deleted: true });
    }
    const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
    if (!createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { ok: false, error: "Delete window expired (24 hours)." },
        { status: 403 }
      );
    }

    await conn.query(
      `UPDATE linescout_messages
       SET message_text = '', deleted_at = NOW(), deleted_by_type = 'agent', deleted_by_id = ?
       WHERE id = ?`,
      [auth.userId, messageId]
    );

    await conn.query(`UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      conversationId,
    ]);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    console.error("POST /api/internal/paid-chat/delete error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to delete message" }, { status: 500 });
  } finally {
    conn.release();
  }
}
