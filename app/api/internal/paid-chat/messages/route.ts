// app/api/internal/paid-chat/messages/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) return { ok: true as const, userId, role };

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const conversationId = Number(url.searchParams.get("conversation_id") || 0);
  const afterId = Number(url.searchParams.get("after_id") || 0);
  const limitRaw = Number(url.searchParams.get("limit") || 80);
  const limit = Math.max(10, Math.min(200, limitRaw));

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    // 1) Conversation + project stage (handoff)
    const [convRows]: any = await conn.query(
      `
      SELECT
        c.id,
        c.chat_mode,
        c.payment_status,
        c.project_status,
        c.assigned_agent_id,
        iu.username AS assigned_agent_username,
        c.handoff_id,
        h.status AS handoff_status
      FROM linescout_conversations c
      LEFT JOIN internal_users iu ON iu.id = c.assigned_agent_id
      LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [conversationId]
    );

    if (!convRows?.length) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = convRows[0];
    const chatMode = String(conv.chat_mode || "");
    const paymentStatus = String(conv.payment_status || "");
    const projectStatus = String(conv.project_status || "");
    const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);

    const assignedAgentUsername =
      typeof conv.assigned_agent_username === "string" && conv.assigned_agent_username.trim()
        ? String(conv.assigned_agent_username).trim()
        : null;

    const handoffId = conv.handoff_id == null ? null : Number(conv.handoff_id);
    const handoffStatusRaw = String(conv.handoff_status || "").trim();
    const handoffStatus = handoffStatusRaw ? handoffStatusRaw : null;

    if (chatMode !== "paid_human" || paymentStatus !== "paid") {
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (projectStatus === "cancelled") {
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    // 2) Agent restriction (admin bypass): allow assigned-to-me OR unassigned
    if (auth.role !== "admin") {
      if (assignedAgentId && assignedAgentId !== auth.userId) {
        return NextResponse.json(
          { ok: false, error: "You are not assigned to this conversation." },
          { status: 403 }
        );
      }
    }

    // 3) Messages
    const [rows]: any = await conn.query(
      `SELECT
         id,
         conversation_id,
         sender_type,
         sender_id,
         message_text,
         created_at
       FROM linescout_messages
       WHERE conversation_id = ?
         AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [conversationId, afterId, limit]
    );

    const lastId = rows?.length ? Number(rows[rows.length - 1].id) : afterId;

    // 4) Attachments for returned messages only
    const ids = (rows || [])
      .map((r: any) => Number(r.id))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    let attachments: any[] = [];
    if (ids.length) {
      const [attRows]: any = await conn.query(
        `
        SELECT
          id,
          conversation_id,
          message_id,
          sender_type,
          sender_id,
          kind,
          original_filename,
          mime_type,
          bytes,
          cloudinary_public_id,
          cloudinary_resource_type,
          cloudinary_format,
          secure_url,
          width,
          height,
          created_at
        FROM linescout_message_attachments
        WHERE conversation_id = ?
          AND message_id IN (?)
        ORDER BY id ASC
        `,
        [conversationId, ids]
      );
      attachments = attRows || [];
    }

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      assigned_agent_id: assignedAgentId,
      assigned_agent_username: assignedAgentUsername,
      items: rows || [],
      last_id: lastId,
      attachments,
      meta: {
        project_status: projectStatus || null,
        handoff_id: handoffId,
        handoff_status: handoffStatus,
      },
    });
  } catch (e: any) {
    console.error("GET /api/internal/paid-chat/messages error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
  } finally {
    conn.release();
  }
}