import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const agent = await requireAgent(req);
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
        `
        SELECT id, conversation_kind, chat_mode, project_status
        FROM linescout_conversations
        WHERE id = ?
        LIMIT 1
        `,
        [conversationId]
      );

      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = rows[0];
      if (String(c.project_status) === "cancelled") {
        return NextResponse.json({ ok: false, error: "This conversation is cancelled." }, { status: 403 });
      }
      if (String(c.conversation_kind || "") !== "quick_human") {
        return NextResponse.json({ ok: false, error: "Not a quick chat." }, { status: 403 });
      }
      if (String(c.chat_mode || "") !== "limited_human") {
        return NextResponse.json({ ok: false, error: "Quick chat has ended." }, { status: 403 });
      }

      await conn.query(
        `
        INSERT INTO linescout_conversation_reads
          (conversation_id, internal_user_id, last_seen_message_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          last_seen_message_id = GREATEST(last_seen_message_id, VALUES(last_seen_message_id)),
          updated_at = CURRENT_TIMESTAMP
        `,
        [conversationId, Number(agent.id), Math.max(0, lastSeenId)]
      );

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        last_seen_message_id: Math.max(0, lastSeenId),
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
