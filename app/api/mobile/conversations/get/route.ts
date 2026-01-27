import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/conversations/get?conversation_id=123
 * Returns the conversation row if it belongs to the signed-in user.
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `SELECT * FROM linescout_conversations WHERE id = ? AND user_id = ? LIMIT 1`,
        [conversationId, userId]
      );

      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, conversation: rows[0] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}