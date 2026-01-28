import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingUploadFile = {
  url: string; // from your upload route
  public_id: string;
  mime?: string | null;
  bytes?: number | null;
  original_name?: string | null;
};

type IncomingAttachment = {
  // accept both url and secure_url for safety
  url?: string | null;
  secure_url?: string | null;

  public_id: string;

  mime?: string | null;
  bytes?: number | null;

  original_name?: string | null;
  original_filename?: string | null;

  // optional extras if you later include them
  resource_type?: "image" | "raw" | "video" | string;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  kind?: "image" | "pdf" | "file" | string;
};

/**
 * POST /api/mobile/paid-chat/send
 * body:
 * {
 *   conversation_id: number,
 *   message_text?: string,
 *   attachment?: IncomingAttachment,
 *   file?: IncomingUploadFile // exact upload response
 * }
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "").trim();

    const attachmentRaw: IncomingAttachment | null =
      body?.attachment && typeof body.attachment === "object" ? body.attachment : null;

    const fileRaw: IncomingUploadFile | null =
      body?.file && typeof body.file === "object" ? body.file : null;

    // Normalize attachment from either "attachment" or "file"
    const publicId = String(
      (attachmentRaw?.public_id ?? fileRaw?.public_id ?? "") || ""
    ).trim();

    const url =
      String(attachmentRaw?.secure_url || attachmentRaw?.url || fileRaw?.url || "").trim() || "";

    const mime = String(attachmentRaw?.mime ?? fileRaw?.mime ?? "").trim() || null;
    const bytesNum = Number(attachmentRaw?.bytes ?? fileRaw?.bytes ?? 0) || null;

    const originalName =
      String(
        attachmentRaw?.original_filename ||
          attachmentRaw?.original_name ||
          fileRaw?.original_name ||
          ""
      ).trim() || null;

    const hasAttachment = Boolean(publicId && url);
    const hasText = messageText.length > 0;

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    // Must have either text OR attachment OR both
    if (!hasText && !hasAttachment) {
      return NextResponse.json(
        { ok: false, error: "message_text or attachment is required" },
        { status: 400 }
      );
    }

    if (messageText.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "message_text too long" },
        { status: 400 }
      );
    }

    // Optional: keep limits consistent with upload route (defensive)
    if (hasAttachment && bytesNum) {
      const m = String(mime || "").toLowerCase();
      const max = m === "application/pdf" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
      if (bytesNum > max) {
        return NextResponse.json(
          { ok: false, error: `File too large. Max ${Math.floor(max / (1024 * 1024))}MB` },
          { status: 400 }
        );
      }
    }

    const allowDevUnpaid = process.env.ALLOW_DEV_UNPAID_PAID_CHAT === "1";

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Load conversation + linked handoff status
      const [crows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.handoff_id,
          h.status AS handoff_status,
          h.cancel_reason
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, userId]
      );

      if (!crows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = crows[0];

      if (String(c.chat_mode) !== "paid_human") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Paid chat is not enabled for this conversation." },
          { status: 403 }
        );
      }

      if (!allowDevUnpaid && String(c.payment_status) !== "paid") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "Payment has not been confirmed for this project." },
          { status: 403 }
        );
      }

      const handoffStatus = String(c.handoff_status || "").toLowerCase();
      const projectCancelled = String(c.project_status) === "cancelled";
      const isLocked =
        projectCancelled || handoffStatus === "cancelled" || handoffStatus === "delivered";

      if (isLocked) {
        await conn.rollback();
        return NextResponse.json(
          {
            ok: false,
            code: "PROJECT_LOCKED",
            error:
              handoffStatus === "delivered"
                ? "This project is completed. Start a new project to continue."
                : "This project is cancelled. Start a new project to continue.",
            meta: {
              conversation_id: Number(c.id),
              handoff_id: c.handoff_id ? Number(c.handoff_id) : null,
              project_status: String(c.project_status || ""),
              handoff_status: handoffStatus || null,
              cancel_reason: c.cancel_reason || null,
            },
          },
          { status: 403 }
        );
      }

      // Insert message (allow blank if attachment exists)
      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_messages
          (conversation_id, sender_type, sender_id, message_text)
        VALUES
          (?, 'user', ?, ?)
        `,
        [conversationId, userId, hasText ? messageText : ""]
      );

      const messageId = Number(ins?.insertId || 0);

      // Insert attachment row if present
      if (hasAttachment) {
        const m = String(mime || "").toLowerCase();
        const isImage = m === "image/jpeg" || m === "image/jpg" || m === "image/png";
        const isPdf = m === "application/pdf";

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
            originalName ? String(originalName).slice(0, 255) : null,
            mime ? String(mime).slice(0, 120) : null,
            bytesNum ? Number(bytesNum) : null,
            publicId.slice(0, 200),
            resourceType,
            format,
            url,
            null,
            null,
          ]
        );
      }

      // Touch conversation
      await conn.query(
        `UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [conversationId]
      );

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
        WHERE id = ?
        LIMIT 1
        `,
        [messageId]
      );

      const [attRows]: any = await conn.query(
        `
        SELECT
          id,
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

      return NextResponse.json({
        ok: true,
        item: rows?.[0] || null,
        attachments: attRows || [],
      });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      console.error("POST /api/mobile/paid-chat/send error:", e?.message || e);
      return NextResponse.json(
        { ok: false, error: "Failed to send message" },
        { status: 500 }
      );
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}