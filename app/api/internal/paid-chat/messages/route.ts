// app/api/internal/paid-chat/messages/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

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
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
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
  const auth = await requireInternalAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const conversationId = Number(url.searchParams.get("conversation_id") || 0);
  const afterId = Number(url.searchParams.get("after_id") || 0);
  const beforeId = Number(url.searchParams.get("before_id") || 0);
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
        ap.first_name AS assigned_agent_first_name,
        ap.last_name AS assigned_agent_last_name,
        c.handoff_id,
        h.status AS handoff_status,
        h.customer_name AS customer_name,
        h.context AS handoff_context,
        (
          SELECT l.name
          FROM linescout_leads l
          WHERE l.email = u.email
          ORDER BY l.created_at DESC
          LIMIT 1
        ) AS lead_name
      FROM linescout_conversations c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN internal_users iu ON iu.id = c.assigned_agent_id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = c.assigned_agent_id
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
    const assignedFirst = String(conv.assigned_agent_first_name || "").trim();
    const assignedLast = String(conv.assigned_agent_last_name || "").trim();
    const assignedAgentName = assignedFirst || assignedAgentUsername || null;
    const customerRaw = String(conv.customer_name || conv.lead_name || "").trim();
    const customerFirst = customerRaw ? customerRaw.split(/\s+/)[0] : "";
    const customerName = customerFirst || "Customer";

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
    let rows: any[] = [];
    let hasMore = false;

    if (beforeId > 0) {
      const [res]: any = await conn.query(
        `SELECT
           id,
           conversation_id,
           sender_type,
           sender_id,
           message_text,
           created_at
         FROM linescout_messages
         WHERE conversation_id = ?
           AND id < ?
         ORDER BY id DESC
         LIMIT ?`,
        [conversationId, beforeId, limit + 1]
      );
      rows = res || [];
      if (rows.length > limit) {
        hasMore = true;
        rows = rows.slice(0, limit);
      }
      rows = rows.reverse();
    } else if (afterId > 0) {
      const [res]: any = await conn.query(
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
      rows = res || [];
    } else {
      const [res]: any = await conn.query(
        `SELECT
           id,
           conversation_id,
           sender_type,
           sender_id,
           message_text,
           created_at
         FROM linescout_messages
         WHERE conversation_id = ?
         ORDER BY id DESC
         LIMIT ?`,
        [conversationId, limit + 1]
      );
      rows = res || [];
      if (rows.length > limit) {
        hasMore = true;
        rows = rows.slice(0, limit);
      }
      rows = rows.reverse();
    }

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

    // Group attachments by message_id for easy UI rendering
    const attachmentsByMessageId: Record<string, any[]> = {};
    for (const a of attachments) {
      const mid = String(a.message_id);
      if (!attachmentsByMessageId[mid]) attachmentsByMessageId[mid] = [];
      attachmentsByMessageId[mid].push(a);
    }

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      assigned_agent_id: assignedAgentId,
      assigned_agent_username: assignedAgentUsername,
      items: rows || [],
      last_id: lastId,
      has_more: hasMore,
      attachments,
      attachments_by_message_id: attachmentsByMessageId,
      meta: {
        project_status: projectStatus || null,
        handoff_id: handoffId,
        handoff_status: handoffStatus,
        customer_name: customerName,
        agent_name: assignedAgentName,
        handoff_context: conv.handoff_context ?? null,
      },
    });
  } catch (e: any) {
    console.error("GET /api/internal/paid-chat/messages error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
  } finally {
    conn.release();
  }
}
