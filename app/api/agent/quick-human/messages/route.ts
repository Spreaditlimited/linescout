// app/api/agent/quick-human/messages/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAgent(req);

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
      // Ensure this is a quick-human conversation
      const [crows]: any = await conn.query(
        `
        SELECT id, conversation_kind, project_status, chat_mode
        FROM linescout_conversations
        WHERE id = ?
          AND conversation_kind = 'quick_human'
        LIMIT 1
        `,
        [conversationId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      // Messages
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

      const lastId = rows?.length ? Number(rows[rows.length - 1].id) : afterId;

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        items: rows || [],
        last_id: lastId,
      });
    } catch (e: any) {
      console.error("GET /api/agent/quick-human/messages error:", e?.message || e);
      return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}