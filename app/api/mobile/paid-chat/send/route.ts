import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/paid-chat/send
 * body: { conversation_id: number, message_text: string }
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

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

    const allowDevUnpaid = process.env.ALLOW_DEV_UNPAID_PAID_CHAT === "1";

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Load conversation + linked handoff status
      const [crows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.handoff_id,
          h.status AS handoff_status,
          h.cancel_reason
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = crows[0];

      if (String(c.chat_mode) !== "paid_human") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Paid chat is not enabled for this conversation." },
          { status: 403 }
        );
      }

      if (!allowDevUnpaid && String(c.payment_status) !== "paid") {
        await conn.rollback();
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
        await conn.rollback();
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

      // Insert user message
      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_messages
          (conversation_id, sender_type, sender_id, message_text)
        VALUES
          (?, 'user', ?, ?)
        `,
        [conversationId, userId, messageText]
      );

      const messageId = Number(ins?.insertId || 0);

      // Touch conversation to bump it in lists / agent inbox
      await conn.query(
        `UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [conversationId]
      );

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
        WHERE id = ?
        LIMIT 1
        `,
        [messageId]
      );

      await conn.commit();

      return NextResponse.json({ ok: true, item: rows?.[0] || null });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      console.error("POST /api/mobile/paid-chat/send error:", e?.message || e);
      return NextResponse.json({ ok: false, error: "Failed to send message" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}