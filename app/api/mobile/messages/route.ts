// app/api/mobile/messages/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function stripLeadingEquals(s: string): string {
  return String(s || "").replace(/^\s*=+\s*/, "").trim();
}

function tryUnwrapReplyText(raw: string): string {
  const t = String(raw || "").trim();
  if (!t.startsWith("{") || !t.includes("replyText")) return "";
  try {
    const parsed = JSON.parse(t);
    if (typeof parsed?.replyText === "string" && parsed.replyText.trim()) {
      return stripLeadingEquals(parsed.replyText);
    }
  } catch {}
  return "";
}

async function callN8nChat(body: any) {
  const baseUrl = process.env.N8N_BASE_URL || process.env.NEXT_PUBLIC_N8N_BASE_URL;
  if (!baseUrl) throw new Error("Missing N8N base URL");

  const webhookUrl = `${baseUrl}/webhook/linescout_machine_chat`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const rawText = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`n8n error ${res.status}: ${rawText}`);

  // n8n sometimes returns JSON, sometimes plain text
  const unwrapped = tryUnwrapReplyText(rawText);
  const reply = stripLeadingEquals(unwrapped || rawText);

  if (!reply.trim()) throw new Error("n8n returned empty reply");
  return reply;
}

/**
 * GET /api/mobile/messages?conversation_id=123&after_id=456
 * Returns messages in ASC order (oldest -> newest)
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);
    const afterId = Number(url.searchParams.get("after_id") || 0);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      // Ensure user owns this conversation
      const [rows]: any = await conn.query(
        `SELECT id FROM linescout_conversations WHERE id = ? AND user_id = ? LIMIT 1`,
        [conversationId, userId]
      );
      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const [msgs]: any = await conn.query(
        `
        SELECT id, sender_type, sender_id, message_text, created_at
        FROM linescout_messages
        WHERE conversation_id = ?
          AND id > ?
        ORDER BY id ASC
        LIMIT 80
        `,
        [conversationId, afterId]
      );

      return NextResponse.json({ ok: true, items: msgs || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * POST /api/mobile/messages
 * Body: { conversation_id, message_text, route_type }
 * Saves user message, calls n8n, saves AI reply.
 * Agents can also write to linescout_messages with sender_type='agent' via your internal tools.
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "");
    const routeType = String(body?.route_type || "machine_sourcing"); // machine_sourcing | white_label

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }
    if (!isNonEmptyString(messageText)) {
      return NextResponse.json({ ok: false, error: "message_text is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      // Ensure user owns conversation, and fetch chat_mode for context
      const [crows]: any = await conn.query(
        `
        SELECT id, route_type, chat_mode
        FROM linescout_conversations
        WHERE id = ? AND user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
      }

      const chatMode = String(crows[0].chat_mode || "ai_only");

      // 1) Save user message
      const [insUser]: any = await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'user', ?, ?)
        `,
        [conversationId, userId, messageText.trim()]
      );

      const userMessageId = Number(insUser?.insertId || 0);

      // 2) Call n8n for AI reply (works for ai_only and limited_human; agent replies can also appear)
      let aiText = "";
      try {
        // Minimal payload n8n already understands from your web flow
        aiText = await callN8nChat({
          sessionId: `conv_${conversationId}`,
          message: messageText.trim(),
          route_type: routeType,
          chat_mode: chatMode,
          conversation_id: conversationId,
        });
      } catch (e: any) {
        // If AI fails, still return user message saved
        return NextResponse.json({
          ok: true,
          user_message_id: userMessageId,
          ai_saved: false,
          ai_error: e?.message || "AI failed",
        });
      }

      const [insAi]: any = await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'ai', NULL, ?)
        `,
        [conversationId, aiText]
      );

      const aiMessageId = Number(insAi?.insertId || 0);

      return NextResponse.json({
        ok: true,
        user_message_id: userMessageId,
        ai_message_id: aiMessageId,
        ai_saved: true,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}