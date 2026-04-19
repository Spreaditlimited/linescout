import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildConversationAccessScope } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const body = await req.json().catch(() => ({}));

    const conversationId = Number(body?.conversation_id || 0);
    const titleRaw = String(body?.title || "").trim();

    if (!conversationId || !titleRaw) {
      return NextResponse.json(
        { ok: false, error: "conversation_id and title are required" },
        { status: 400 }
      );
    }

    if (titleRaw.length > 80) {
      return NextResponse.json(
        { ok: false, error: "Title too long (max 80 characters)" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      const access = buildConversationAccessScope("c", {
        accountId: Number(user.account_id),
        userId: Number(user.id),
      });
      const [res]: any = await conn.query(
        `
        UPDATE linescout_conversations c
        SET c.title = ?
        WHERE c.id = ?
          AND ${access.sql}
          AND c.chat_mode IN ('ai_only','limited_human')
        LIMIT 1
        `,
        [titleRaw, conversationId, ...access.params]
      );

      if (!res?.affectedRows) {
        return NextResponse.json(
          { ok: false, error: "Conversation not found or not editable" },
          { status: 404 }
        );
      }

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
  console.error("POST /api/mobile/conversations/rename error:", e);
  return NextResponse.json(
    { ok: false, error: e?.message || "Server error" },
    { status: 500 }
  );
}
}
