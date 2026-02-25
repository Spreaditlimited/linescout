import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensurePaidChatMessageColumns } from "@/lib/paid-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/paid-chat/delete
 * body: { conversation_id, message_id }
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageId = Number(body?.message_id || 0);

    if (!conversationId || !messageId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id and message_id are required" },
        { status: 400 }
      );
    }

    const allowDevUnpaid = process.env.ALLOW_DEV_UNPAID_PAID_CHAT === "1";

    const conn = await db.getConnection();
    try {
      await ensurePaidChatMessageColumns(conn);

      const [crows]: any = await conn.query(
        `
        SELECT c.id, c.user_id, c.chat_mode, c.payment_status, c.project_status, h.status AS handoff_status
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ? AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = crows[0];
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

      const handoffStatus = String(c.handoff_status || "").toLowerCase();
      const projectCancelled = String(c.project_status) === "cancelled";
      const isLocked =
        projectCancelled || handoffStatus === "cancelled" || handoffStatus === "delivered";
      if (isLocked) {
        return NextResponse.json(
          { ok: false, error: "This project is closed." },
          { status: 403 }
        );
      }

      const [mrows]: any = await conn.query(
        `
        SELECT id, sender_type, sender_id, deleted_at, created_at
        FROM linescout_messages
        WHERE id = ? AND conversation_id = ?
        LIMIT 1
        `,
        [messageId, conversationId]
      );

      if (!mrows?.length) {
        return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
      }

      const m = mrows[0];
      if (String(m.sender_type) !== "user" || Number(m.sender_id) !== userId) {
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
         SET message_text = '', deleted_at = NOW(), deleted_by_type = 'user', deleted_by_id = ?
         WHERE id = ?`,
        [userId, messageId]
      );

      await conn.query(`UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        conversationId,
      ]);

      return NextResponse.json({ ok: true, deleted: true });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
