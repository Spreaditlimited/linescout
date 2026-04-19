import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import { buildConversationAccessScope } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/conversations/get?conversation_id=123
 * Returns the conversation row if it belongs to the signed-in user.
 */
export async function GET(req: Request) {
  try {
    const u = await requireAccountUser(req);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const access = buildConversationAccessScope("c", {
        accountId: Number(u.account_id),
        userId: Number(u.id),
      });

      const [rows]: any = await conn.query(
        `SELECT * FROM linescout_conversations c WHERE c.id = ? AND ${access.sql} LIMIT 1`,
        [conversationId, ...access.params]
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
