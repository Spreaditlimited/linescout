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

  const unwrapped = tryUnwrapReplyText(rawText);
  const reply = stripLeadingEquals(unwrapped || rawText);

  if (!reply.trim()) throw new Error("n8n returned empty reply");
  return reply;
}

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  // Expo accepts an array of messages
  const messages = clean.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  // Fire-and-forget is ok, but we still await to avoid silent failures during dev
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  }).catch(() => {});
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
    const beforeId = Number(url.searchParams.get("before_id") || 0);
    const limitRaw = Number(url.searchParams.get("limit") || 80);
    const limit = Math.max(10, Math.min(200, limitRaw));

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      // Ensure user owns this conversation
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.conversation_kind,
          COALESCE(
            NULLIF(
              SUBSTRING_INDEX(
                TRIM((
                  SELECT l.name
                  FROM linescout_leads l
                  WHERE l.email = u.email
                    AND LOWER(TRIM(COALESCE(l.name, ''))) <> 'unknown'
                  ORDER BY l.created_at DESC
                  LIMIT 1
                )),
                ' ',
                1
              ),
              ''
            ),
            NULLIF(SUBSTRING_INDEX(TRIM(u.display_name), ' ', 1), ''),
            'Customer'
          ) AS customer_name
        FROM linescout_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = ? AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );
      if (!rows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      const conv = rows[0] || {};

      let msgs: any[] = [];
      let hasMore = false;

      if (beforeId > 0) {
        const [rows]: any = await conn.query(
          `
          SELECT id, sender_type, sender_id, message_text, created_at
          FROM linescout_messages
          WHERE conversation_id = ?
            AND id < ?
          ORDER BY id DESC
          LIMIT ?
          `,
          [conversationId, beforeId, limit + 1]
        );
        msgs = rows || [];
        if (msgs.length > limit) {
          hasMore = true;
          msgs = msgs.slice(0, limit);
        }
        msgs = msgs.reverse();
      } else if (afterId > 0) {
        const [rows]: any = await conn.query(
          `
          SELECT id, sender_type, sender_id, message_text, created_at
          FROM linescout_messages
          WHERE conversation_id = ?
            AND id > ?
          ORDER BY id ASC
          LIMIT ?
          `,
          [conversationId, afterId, limit]
        );
        msgs = rows || [];
      } else {
        const [rows]: any = await conn.query(
          `
          SELECT id, sender_type, sender_id, message_text, created_at
          FROM linescout_messages
          WHERE conversation_id = ?
          ORDER BY id DESC
          LIMIT ?
          `,
          [conversationId, limit + 1]
        );
        msgs = rows || [];
        if (msgs.length > limit) {
          hasMore = true;
          msgs = msgs.slice(0, limit);
        }
        msgs = msgs.reverse();
      }

      const ids = (msgs || [])
        .map((m: any) => Number(m.id))
        .filter((n: number) => Number.isFinite(n) && n > 0);

      let attachments: any[] = [];
      if (ids.length) {
        const [attRows]: any = await conn.query(
          `
          SELECT
            id,
            conversation_id,
            message_id,
            sender_type,
            sender_id,
            kind,
            original_filename,
            mime_type,
            bytes,
            cloudinary_public_id,
            cloudinary_resource_type,
            cloudinary_format,
            secure_url,
            width,
            height,
            created_at
          FROM linescout_message_attachments
          WHERE conversation_id = ?
            AND message_id IN (?)
          ORDER BY id ASC
          `,
          [conversationId, ids]
        );
        attachments = attRows || [];
      }

      const attachmentsByMessageId: Record<string, any[]> = {};
      for (const a of attachments) {
        const mid = String(a.message_id);
        if (!attachmentsByMessageId[mid]) attachmentsByMessageId[mid] = [];
        attachmentsByMessageId[mid].push(a);
      }

      return NextResponse.json({
        ok: true,
        items: msgs || [],
        meta:
          String(conv?.conversation_kind || "") === "quick_human"
            ? {
                customer_name: String(conv?.customer_name || "Customer"),
                agent_name: "Specialist",
              }
            : undefined,
        attachments,
        attachments_by_message_id: attachmentsByMessageId,
        has_more: hasMore,
      });
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
 *
 * - ai conversations: user msg -> n8n -> ai msg
 * - quick_human: user msg only + push to agents (NO n8n)
 * - paid: user msg only + push to assigned agent (NO n8n)
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
      // Fetch conversation context + guard ownership
      const [crows]: any = await conn.query(
        `
        SELECT
          id,
          user_id,
          route_type,
          chat_mode,
          payment_status,
          project_status,
          conversation_kind,
          assigned_agent_id
        FROM linescout_conversations
        WHERE id = ? AND user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
      }

      const conv = crows[0];
      const chatMode = String(conv.chat_mode || "ai_only");
      const paymentStatus = String(conv.payment_status || "unpaid");
      const projectStatus = String(conv.project_status || "active");
      const conversationKind = String(conv.conversation_kind || "ai"); // ai | quick_human | paid
      const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);

      if (projectStatus === "cancelled") {
        return NextResponse.json({ ok: false, error: "This conversation is cancelled." }, { status: 403 });
      }

      // 1) Save user message
      const [insUser]: any = await conn.query(
        `
        INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
        VALUES (?, 'user', ?, ?)
        `,
        [conversationId, userId, messageText.trim()]
      );
      const userMessageId = Number(insUser?.insertId || 0);

      // Touch conversation updated_at
      await conn.query(
        `UPDATE linescout_conversations SET updated_at = NOW() WHERE id = ? LIMIT 1`,
        [conversationId]
      );

      // QUICK HUMAN: no n8n. Push to agents.
      if (conversationKind === "quick_human") {
        // must be limited_human to allow messaging
        if (chatMode !== "limited_human") {
          return NextResponse.json(
            { ok: false, error: "Quick specialist chat has ended." },
            { status: 403 }
          );
        }

        // notify ALL active agents (unclaimed pool)
        const [trows]: any = await conn.query(
          `
          SELECT token
          FROM linescout_agent_device_tokens
          WHERE is_active = 1
          `,
          []
        );

        const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);

        await sendExpoPush(tokens, {
          title: "New quick question",
          body: messageText.trim().slice(0, 120),
          data: {
            kind: "quick_human",
            conversation_id: conversationId,
            route_type: routeType,
          },
        });

        return NextResponse.json({
          ok: true,
          user_message_id: userMessageId,
          mode: "quick_human",
        });
      }

      // PAID: no n8n. Push to assigned agent (or all if unassigned).
      if (conversationKind === "paid" || chatMode === "paid_human") {
        if (paymentStatus !== "paid" || chatMode !== "paid_human") {
          return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
        }

        let tokens: string[] = [];

        if (assignedAgentId) {
          const [trows]: any = await conn.query(
            `
            SELECT token
            FROM linescout_agent_device_tokens
            WHERE is_active = 1 AND agent_id = ?
            `,
            [assignedAgentId]
          );
          tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        } else {
          const [trows]: any = await conn.query(
            `
            SELECT token
            FROM linescout_agent_device_tokens
            WHERE is_active = 1
            `,
            []
          );
          tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        }

        await sendExpoPush(tokens, {
          title: "New paid message",
          body: messageText.trim().slice(0, 120),
          data: {
            kind: "paid",
            conversation_id: conversationId,
            route_type: routeType,
          },
        });

        return NextResponse.json({
          ok: true,
          user_message_id: userMessageId,
          mode: "paid",
        });
      }

      // AI: keep existing n8n flow
      let aiText = "";
      try {
        aiText = await callN8nChat({
          sessionId: `conv_${conversationId}`,
          message: messageText.trim(),
          route_type: routeType,
          chat_mode: chatMode,
          conversation_id: conversationId,
        });
      } catch (e: any) {
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
        mode: "ai",
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
