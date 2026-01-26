// app/api/mobile/paid-chat/send/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/paid-chat/send
 * body: { conversation_id: number, message_text: string }
 *
 * Saves a USER message into linescout_messages for a paid conversation
 * that belongs to the signed-in user.
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "").trim();

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    if (!messageText) {
      return NextResponse.json(
        { ok: false, error: "message_text is required" },
        { status: 400 }
      );
    }

    // Prevent crazy payloads
    if (messageText.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "message_text too long" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1) Ensure conversation belongs to user AND is in paid human mode
      const [convRows]: any = await conn.query(
        `
        SELECT id, user_id, chat_mode, payment_status, project_status
        FROM linescout_conversations
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!convRows?.length) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Not found" },
          { status: 404 }
        );
      }

      const conv = convRows[0];
      const chatMode = String(conv.chat_mode || "");
      const paymentStatus = String(conv.payment_status || "");
      const projectStatus = String(conv.project_status || "");

      // You can tighten/loosen these rules later, but this is safe by default.
      if (chatMode !== "paid_human" || paymentStatus !== "paid") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Paid chat is not enabled for this conversation." },
          { status: 403 }
        );
      }

      // Optional guard: if project is cancelled, don’t allow sending
      if (projectStatus === "cancelled") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "This project is cancelled." },
          { status: 403 }
        );
      }

      // 2) Insert user message
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

      // 3) Touch conversation updated_at (useful for lists)
      await conn.query(
        `UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [conversationId]
      );

      // 4) Return the inserted message row
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

      return NextResponse.json({
        ok: true,
        item: rows?.[0] || null,
      });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      console.error("POST /api/mobile/paid-chat/send error:", e?.message || e);
      return NextResponse.json(
        { ok: false, error: "Failed to send message" },
        { status: 500 }
      );
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}