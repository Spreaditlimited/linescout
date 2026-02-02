// app/api/mobile/ai-chat/send/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/ai-chat/send
 * body: { conversation_id: number, message_text: string }
 *
 * IMPORTANT DESIGN:
 * - This route writes BOTH the user message + AI reply into linescout_messages
 * - It calls /api/linescout-chat (the ONLY gateway to n8n)
 * - It returns TEXT (text/plain) like /api/linescout-chat, so the mobile UI can treat it as a normal reply string.
 * - It also exposes inserted IDs via response headers (optional for debugging).
 */
export async function POST(req: Request) {
  console.log("AI_CHAT_SEND: route hit");

  try {
    // ---- Auth (Bearer token)
    const authHeader = req.headers.get("authorization");
    console.log("AI_CHAT_SEND: auth header present?", !!authHeader);

    const u = await requireUser(req);
    const userId = Number(u.id);
    console.log("AI_CHAT_SEND: requireUser OK", { userId });

    // ---- Payload
    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "").trim();

    console.log("AI_CHAT_SEND: payload", {
      conversationId,
      messageLength: messageText.length,
    });

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

    if (messageText.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "message_text too long" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // 1) Ensure conversation belongs to user and is active
      const [convRows]: any = await conn.query(
        `SELECT id, user_id, project_status
         FROM linescout_conversations
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [conversationId, userId]
      );

      if (!convRows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      // AI chats are for clarity only and should not be blocked by project status.

      // 2) Insert USER message
      const [insUser]: any = await conn.query(
        `INSERT INTO linescout_messages
           (conversation_id, sender_type, sender_id, message_text)
         VALUES
           (?, 'user', ?, ?)`,
        [conversationId, userId, messageText]
      );

      const userMessageId = Number(insUser?.insertId || 0);

      // 3) Load last 30 messages as context for LineScout
      const [threadRows]: any = await conn.query(
        `SELECT id, sender_type, message_text
         FROM linescout_messages
         WHERE conversation_id = ?
         ORDER BY id DESC
         LIMIT 30`,
        [conversationId]
      );

      const thread = (Array.isArray(threadRows) ? threadRows : [])
        .reverse()
        .map((r: any) => ({
          id: String(r.id),
          role: r.sender_type === "user" ? ("user" as const) : ("assistant" as const),
          content: String(r.message_text || ""),
        }));

      // 4) Call LineScout (ONLY through /api/linescout-chat)
      const baseUrl = new URL(req.url); // gives us scheme+host in this environment
      const linescoutUrl = new URL("/api/linescout-chat", baseUrl);

      console.log("AI_CHAT_SEND: calling /api/linescout-chat", {
        url: String(linescoutUrl),
        sessionId: `c-${conversationId}`,
        messagesCount: thread.length,
      });

      const lsRes = await fetch(linescoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `c-${conversationId}`,
          message: messageText,
          messages: thread,
          tokenCandidate: "",
        }),
      });

      const aiText = (await lsRes.text().catch(() => "")).trim();

      console.log("AI_CHAT_SEND: linescout-chat response", {
        status: lsRes.status,
        preview: aiText.slice(0, 120),
      });

      if (!lsRes.ok) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: `LineScout error (HTTP ${lsRes.status})` },
          { status: 500 }
        );
      }

      if (!aiText) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "LineScout replied, but no message text was returned." },
          { status: 500 }
        );
      }

      // 5) Insert AI reply
      const [insAi]: any = await conn.query(
        `INSERT INTO linescout_messages
           (conversation_id, sender_type, sender_id, message_text)
         VALUES
           (?, 'ai', NULL, ?)`,
        [conversationId, aiText]
      );

      const aiMessageId = Number(insAi?.insertId || 0);

      // 6) Touch updated_at so list ordering updates
      await conn.query(
        `UPDATE linescout_conversations
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [conversationId]
      );

      await conn.commit();

      // Return TEXT so the mobile UI keeps working exactly like before.
      // Expose IDs via headers (optional, but very useful for debugging).
      return new NextResponse(aiText, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-User-Message-Id": String(userMessageId),
          "X-AI-Message-Id": String(aiMessageId),
        },
      });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}

      console.error("AI_CHAT_SEND: error", e?.message || e);
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error("AI_CHAT_SEND: unauthorized", e?.message || e);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
