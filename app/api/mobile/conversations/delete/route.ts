import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildConversationAccessScope } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes an AI conversation (and its messages) that belongs to the user.
 * Hard rules:
 * - Only ai_only / limited_human
 * - Must be unpaid
 * - Must NOT be linked to a handoff (paid project)
 */
export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const body = await req.json().catch(() => ({}));

    const conversationId = Number(body?.conversation_id || 0);
    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      const access = buildConversationAccessScope("c", {
        accountId: Number(user.account_id),
        userId: Number(user.id),
      });
      // 1) Confirm ownership + deletable type
      const [rows]: any = await conn.query(
        `
        SELECT c.id
        FROM linescout_conversations c
        WHERE c.id = ?
          AND ${access.sql}
          AND c.chat_mode IN ('ai_only','limited_human')
          AND c.payment_status = 'unpaid'
          AND c.handoff_id IS NULL
        LIMIT 1
        `,
        [conversationId, ...access.params]
      );

      if (!rows?.length) {
        return NextResponse.json(
          { ok: false, error: "Conversation not found or not deletable" },
          { status: 404 }
        );
      }

      // 2) Delete messages first (FK-safe)
      await conn.query(`DELETE FROM linescout_messages WHERE conversation_id = ?`, [
        conversationId,
      ]);

      // 3) Delete the conversation
      const [del]: any = await conn.query(
        `DELETE c FROM linescout_conversations c WHERE c.id = ? AND ${access.sql} LIMIT 1`,
        [conversationId, ...access.params]
      );

      if (!del?.affectedRows) {
        return NextResponse.json(
          { ok: false, error: "Delete failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
  console.error("POST /api/mobile/conversations/delete error:", e);
  return NextResponse.json(
    { ok: false, error: e?.message || "Server error" },
    { status: 500 }
  );
}
}
