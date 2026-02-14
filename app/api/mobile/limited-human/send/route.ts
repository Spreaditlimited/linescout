// app/api/mobile/limited-human/send/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { suggestConversationTitle } from "@/lib/conversation-title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickConvRow = {
  id: number;
  user_id: number;
  route_type: "machine_sourcing" | "white_label" | "simple_sourcing";
  conversation_kind: "ai" | "quick_human" | "paid";
  chat_mode: "ai_only" | "limited_human" | "paid_human";
  project_status: "active" | "cancelled";
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
};

type IncomingUploadFile = {
  url: string;
  public_id: string;
  mime?: string | null;
  bytes?: number | null;
  original_name?: string | null;
};

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeFile(body: any): {
  hasFile: boolean;
  url: string | null;
  publicId: string | null;
  mime: string | null;
  bytes: number | null;
  originalName: string | null;
} {
  const f: IncomingUploadFile | null = body?.file && typeof body.file === "object" ? body.file : null;

  const url = String(f?.url || "").trim() || null;
  const publicId = String(f?.public_id || "").trim() || null;
  const mime = String(f?.mime || "").trim() || null;
  const bytes = Number(f?.bytes || 0) || null;
  const originalName = String(f?.original_name || "").trim() || null;

  return { hasFile: Boolean(url && publicId), url, publicId, mime, bytes, originalName };
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "").trim();
    const file = normalizeFile(body);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }
    if (!isNonEmptyString(messageText) && !file.hasFile) {
      return NextResponse.json(
        { ok: false, error: "message_text or file is required" },
        { status: 400 }
      );
    }
    if (messageText.length > 8000) {
      return NextResponse.json({ ok: false, error: "message_text too long" }, { status: 400 });
    }
    if (file.hasFile && file.bytes) {
      const m = String(file.mime || "").toLowerCase();
      const max = m === "application/pdf" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
      if (file.bytes > max) {
        return NextResponse.json(
          { ok: false, error: `File too large. Max ${Math.floor(max / (1024 * 1024))}MB` },
          { status: 400 }
        );
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Lock conversation row to prevent double-consume on rapid sends
      const [crows]: any = await conn.query(
        `
        SELECT
          id, user_id, route_type, conversation_kind, chat_mode, project_status, title,
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
      const existingTitle = String(crows?.[0]?.title || "").trim();

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
        [conversationId, userId, messageText || ""]
      );

      const messageId = Number(insUser?.insertId || 0);

      if (file.hasFile) {
        const mime = String(file.mime || "").toLowerCase();
        const isImage = mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png";
        const isPdf = mime === "application/pdf";

        const kind = isImage ? "image" : isPdf ? "pdf" : "file";
        const resourceType = isImage ? "image" : "raw";
        const format = isPdf ? "pdf" : null;

        await conn.query(
          `
          INSERT INTO linescout_message_attachments
            (
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
              height
            )
          VALUES
            (?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            conversationId,
            messageId,
            userId,
            kind,
            file.originalName ? String(file.originalName).slice(0, 255) : null,
            file.mime ? String(file.mime).slice(0, 120) : null,
            file.bytes ? Number(file.bytes) : null,
            String(file.publicId).slice(0, 200),
            resourceType,
            format,
            String(file.url),
            null,
            null,
          ]
        );
      }
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
        WHERE message_id = ?
        ORDER BY id ASC
        `,
        [messageId]
      );

      await conn.commit();

      // Auto-title if missing and user has not renamed
      if (!existingTitle) {
        const suggested = await suggestConversationTitle({
          userText: messageText,
          routeType: String(c.route_type || ""),
        });
        if (suggested) {
          await conn.query(
            `UPDATE linescout_conversations
             SET title = ?
             WHERE id = ? AND user_id = ? AND (title IS NULL OR TRIM(title) = '')`,
            [suggested, conversationId, userId]
          );
        }
      }

      const remaining = Math.max(limit - nextUsed, 0);

      return NextResponse.json({
        ok: true,
        item: msgRows?.[0] || null,
        attachments: attRows || [],
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
