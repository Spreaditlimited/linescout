// app/api/mobile/paid-chat/messages/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/paid-chat/messages?conversation_id=123&after_id=0&limit=60
 * Returns messages (user/agent/ai if present) for that conversation,
 * but only if it belongs to the signed-in user.
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);
    const afterId = Number(url.searchParams.get("after_id") || 0);
    const limitRaw = Number(url.searchParams.get("limit") || 60);
    const limit = Math.max(10, Math.min(200, limitRaw));

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      // Ensure the conversation belongs to this user
      const [ownRows]: any = await conn.query(
        `SELECT id FROM linescout_conversations WHERE id = ? AND user_id = ? LIMIT 1`,
        [conversationId, userId]
      );

      if (!ownRows?.length) {
        return NextResponse.json(
          { ok: false, error: "Not found" },
          { status: 404 }
        );
      }

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

      const lastId =
        rows && rows.length ? Number(rows[rows.length - 1].id) : afterId;

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        items: rows || [],
        last_id: lastId,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}