import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const userId = Number(user.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const lastSeenId = Number(body?.last_seen_message_id || 0);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }
    if (!lastSeenId) {
      return NextResponse.json({ ok: false, error: "last_seen_message_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `SELECT id, user_id, chat_mode, payment_status, project_status
         FROM linescout_conversations
         WHERE id = ?
           AND user_id = ?
         LIMIT 1`,
        [conversationId, userId]
      );

      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = rows[0];
      if (String(c.chat_mode) !== "paid_human" || String(c.payment_status) !== "paid") {
        return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
      }
      if (String(c.project_status) === "cancelled") {
        return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
      }

      await conn.query(
        `
        INSERT INTO linescout_user_conversation_reads
          (conversation_id, user_id, last_seen_message_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          last_seen_message_id = GREATEST(last_seen_message_id, VALUES(last_seen_message_id)),
          updated_at = CURRENT_TIMESTAMP
        `,
        [conversationId, userId, lastSeenId]
      );

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        last_seen_message_id: lastSeenId,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
