// app/api/mobile/limited-human/send/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickConvRow = {
  id: number;
  user_id: number;
  route_type: "machine_sourcing" | "white_label";
  conversation_kind: "ai" | "quick_human" | "paid";
  chat_mode: "ai_only" | "limited_human" | "paid_human";
  project_status: "active" | "cancelled";
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
};

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

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
    if (!isNonEmptyString(messageText)) {
      return NextResponse.json({ ok: false, error: "message_text is required" }, { status: 400 });
    }
    if (messageText.length > 8000) {
      return NextResponse.json({ ok: false, error: "message_text too long" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Lock conversation row to prevent double-consume on rapid sends
      const [crows]: any = await conn.query(
        `
        SELECT
          id, user_id, route_type, conversation_kind, chat_mode, project_status,
          human_message_limit, human_message_used, human_access_expires_at
        FROM linescout_conversations
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c: QuickConvRow = crows[0];

      // Must be an active quick-human conversation
      if (
        c.conversation_kind !== "quick_human" ||
        c.project_status !== "active" ||
        c.chat_mode !== "limited_human"
      ) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Quick specialist chat is not active." },
          { status: 403 }
        );
      }

      const limit = Number(c.human_message_limit || 0);
      const used = Number(c.human_message_used || 0);

      const exp = c.human_access_expires_at ? Date.parse(c.human_access_expires_at) : NaN;
      const expired = Number.isFinite(exp) ? Date.now() > exp : false;
      const exhausted = limit > 0 && used >= limit;

      if (expired || exhausted) {
        // End immediately
        await conn.query(
          `
          UPDATE linescout_conversations
          SET chat_mode = 'ai_only',
              human_message_limit = 0,
              human_message_used = 0,
              human_access_expires_at = NULL,
              project_status = 'cancelled',
              updated_at = NOW()
          WHERE id = ? AND user_id = ?
          `,
          [conversationId, userId]
        );

        await conn.commit();

        return NextResponse.json(
          { ok: false, code: "LIMITED_HUMAN_ENDED", error: "Quick specialist chat has ended." },
          { status: 403 }
        );
      }

      // Insert USER message
      const [insUser]: any = await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'user', ?, ?)
        `,
        [conversationId, userId, messageText]
      );

      const messageId = Number(insUser?.insertId || 0);

      // Touch conversation ordering
      await conn.query(
        `UPDATE linescout_conversations SET updated_at = NOW() WHERE id = ?`,
        [conversationId]
      );

      // Consume one "specialist reply allowance" token per user send (your chosen rule)
      const nextUsed = used + 1;
      const nowExhausted = limit > 0 && nextUsed >= limit;

      if (nowExhausted) {
        await conn.query(
          `
          UPDATE linescout_conversations
          SET chat_mode = 'ai_only',
              human_message_limit = 0,
              human_message_used = 0,
              human_access_expires_at = NULL,
              project_status = 'cancelled',
              updated_at = NOW()
          WHERE id = ? AND user_id = ?
          `,
          [conversationId, userId]
        );
      } else {
        await conn.query(
          `
          UPDATE linescout_conversations
          SET human_message_used = human_message_used + 1,
              updated_at = NOW()
          WHERE id = ? AND user_id = ?
          `,
          [conversationId, userId]
        );
      }

      // Return inserted message + updated state
      const [msgRows]: any = await conn.query(
        `
        SELECT id, conversation_id, sender_type, sender_id, message_text, created_at
        FROM linescout_messages
        WHERE id = ?
        LIMIT 1
        `,
        [messageId]
      );

      await conn.commit();

      const remaining = Math.max(limit - nextUsed, 0);

      return NextResponse.json({
        ok: true,
        item: msgRows?.[0] || null,
        meta: {
          conversation_id: conversationId,
          ended: nowExhausted,
          human_message_limit: limit,
          human_message_used: nextUsed,
          remaining,
          human_access_expires_at: c.human_access_expires_at,
        },
      });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}