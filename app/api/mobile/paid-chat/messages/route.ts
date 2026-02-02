import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/paid-chat/messages?conversation_id=123&after_id=0&limit=60
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);
    const afterId = Number(url.searchParams.get("after_id") || 0);
    const beforeId = Number(url.searchParams.get("before_id") || 0);
    const limitRaw = Number(url.searchParams.get("limit") || 60);
    const limit = Math.max(10, Math.min(200, limitRaw));

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const allowDevUnpaid = process.env.ALLOW_DEV_UNPAID_PAID_CHAT === "1";

    const conn = await db.getConnection();
    try {
      // Load conversation + linked handoff (project)
      const [crows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.handoff_id,
          c.assigned_agent_id,

          h.status AS handoff_status,
          h.claimed_by,
          h.claimed_at,
          h.manufacturer_found_at,
          h.paid_at,
          h.shipped_at,
          h.delivered_at,
          h.cancelled_at,
          h.cancel_reason,
          h.customer_name,

          iu.username AS assigned_agent_username,
          ap.first_name AS assigned_agent_first_name,
          ap.last_name AS assigned_agent_last_name
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        LEFT JOIN internal_users iu ON iu.id = c.assigned_agent_id
        LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = c.assigned_agent_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = crows[0];

      // Hard guards
      if (String(c.chat_mode) !== "paid_human") {
        return NextResponse.json(
          { ok: false, error: "Paid chat is not enabled for this conversation." },
          { status: 403 }
        );
      }

      if (!allowDevUnpaid && String(c.payment_status) !== "paid") {
        return NextResponse.json(
          { ok: false, error: "Payment has not been confirmed for this project." },
          { status: 403 }
        );
      }

      // Lock rules: conversation cancelled OR handoff delivered/cancelled
      const projectCancelled = String(c.project_status) === "cancelled";
      const handoffStatus = String(c.handoff_status || "").toLowerCase();

      const isLocked =
        projectCancelled || handoffStatus === "cancelled" || handoffStatus === "delivered";

      if (isLocked) {
        return NextResponse.json(
          {
            ok: false,
            code: "PROJECT_LOCKED",
            error:
              handoffStatus === "delivered"
                ? "This project is completed. Start a new project to continue."
                : "This project is cancelled. Start a new project to continue.",
            meta: {
              conversation_id: Number(c.id),
              handoff_id: c.handoff_id ? Number(c.handoff_id) : null,
              project_status: String(c.project_status || ""),
              handoff_status: handoffStatus || null,
              cancel_reason: c.cancel_reason || null,
            },
          },
          { status: 403 }
        );
      }

      const assignedFirst = String(c.assigned_agent_first_name || "").trim();
      const assignedLast = String(c.assigned_agent_last_name || "").trim();
      const assignedAgentName =
        `${assignedFirst} ${assignedLast}`.trim() ||
        String(c.assigned_agent_username || "").trim() ||
        null;

      // Fetch messages
      let items: any[] = [];
      let hasMore = false;

      if (beforeId > 0) {
        const [rows]: any = await conn.query(
          `
          SELECT
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
          LIMIT ?
          `,
          [conversationId, beforeId, limit + 1]
        );
        items = Array.isArray(rows) ? rows : [];
        if (items.length > limit) {
          hasMore = true;
          items = items.slice(0, limit);
        }
        items = items.reverse();
      } else if (afterId > 0) {
        const [rows]: any = await conn.query(
          `
          SELECT
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
          LIMIT ?
          `,
          [conversationId, afterId, limit]
        );
        items = Array.isArray(rows) ? rows : [];
      } else {
        const [rows]: any = await conn.query(
          `
          SELECT
            id,
            conversation_id,
            sender_type,
            sender_id,
            message_text,
            created_at
          FROM linescout_messages
          WHERE conversation_id = ?
          ORDER BY id DESC
          LIMIT ?
          `,
          [conversationId, limit + 1]
        );
        items = Array.isArray(rows) ? rows : [];
        if (items.length > limit) {
          hasMore = true;
          items = items.slice(0, limit);
        }
        items = items.reverse();
      }

      const lastId = items.length ? Number(items[items.length - 1].id) : afterId;

      // Fetch attachments for these messages (if any)
      let attachments: any[] = [];
      const messageIds = items.map((m: any) => Number(m.id)).filter((n: number) => Number.isFinite(n) && n > 0);

      if (messageIds.length) {
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
          [conversationId, messageIds]
        );

        attachments = Array.isArray(attRows) ? attRows : [];
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
        conversation_id: Number(c.id),
        items,
        last_id: lastId,
        has_more: hasMore,

        // NEW: attachments
        attachments, // optional flat list
        attachments_by_message_id: attachmentsByMessageId, // easiest for UI

        // Include project meta so UI can render status
        meta: {
          handoff_id: c.handoff_id ? Number(c.handoff_id) : null,
          project_status: String(c.project_status || ""),
          handoff_status: handoffStatus || null,
          customer_name: c.customer_name ?? null,
          agent_name: assignedAgentName,

          claimed_by: c.claimed_by || null,
          claimed_at: c.claimed_at || null,
          manufacturer_found_at: c.manufacturer_found_at || null,
          paid_at: c.paid_at || null,
          shipped_at: c.shipped_at || null,
          delivered_at: c.delivered_at || null,
          cancelled_at: c.cancelled_at || null,
          cancel_reason: c.cancel_reason || null,
        },
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
