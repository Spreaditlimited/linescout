// app/api/agent/quick-human/send/route.ts
import { NextResponse } from "next/server";
import { db, queryOne } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_MESSAGE =
  "Thank you for creating an account. Please go to your profile to complete all required sections. Our account approval team will review and approve your account so you can start claiming projects.";

type PermissionRow = RowDataPacket & { can_view_handoffs: number };

async function ensureApprovedAgent(userId: number, role: string) {
  if (role === "admin") return true;
  const row = await queryOne<PermissionRow>(
    `
    SELECT COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
    FROM internal_users u
    LEFT JOIN internal_user_permissions p ON p.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );
  return !!row?.can_view_handoffs;
}

type IncomingUploadFile = {
  url: string;
  public_id: string;
  mime?: string | null;
  bytes?: number | null;
  original_name?: string | null;
};

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
    const agent = await requireAgent(req);
    const approved = await ensureApprovedAgent(Number(agent.id), String(agent.role || ""));
    if (!approved) {
      return NextResponse.json(
        { ok: false, error: "ACCOUNT_APPROVAL_REQUIRED", message: APPROVAL_MESSAGE },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const messageText = String(body?.message_text || "").trim();
    const file = normalizeFile(body);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    if (!messageText && !file.hasFile) {
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

      // Ensure it's an ACTIVE quick-human conversation and still within window
      const [rows]: any = await conn.query(
        `
        SELECT
          id,
          chat_mode,
          project_status,
          human_message_limit,
          human_message_used,
          human_access_expires_at
        FROM linescout_conversations
        WHERE id = ?
          AND conversation_kind = 'quick_human'
        LIMIT 1
        `,
        [conversationId]
      );

      if (!rows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      const c = rows[0];
      const projectStatus = String(c.project_status || "");
      const chatMode = String(c.chat_mode || "");
      const limit = Number(c.human_message_limit || 0);
      const used = Number(c.human_message_used || 0);

      const exp = c.human_access_expires_at ? Date.parse(String(c.human_access_expires_at)) : NaN;
      const expired = Number.isFinite(exp) ? Date.now() > exp : false;
      const exhausted = limit > 0 && used >= limit;

      if (projectStatus !== "active") {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "This quick chat is closed." }, { status: 403 });
      }

      if (chatMode !== "limited_human" || expired || exhausted) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Quick chat window has ended." }, { status: 403 });
      }

      // Insert AGENT message
      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_messages
          (conversation_id, sender_type, sender_id, message_text)
        VALUES
          (?, 'agent', ?, ?)
        `,
        [conversationId, Number(agent.id), messageText || ""]
      );

      const messageId = Number(ins?.insertId || 0);

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
            (?, ?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            conversationId,
            messageId,
            Number(agent.id),
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

      // Touch conversation for inbox ordering
      await conn.query(
        `
        UPDATE linescout_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [conversationId]
      );

      // Return inserted message row (same shape you already use elsewhere)
      const [mrows]: any = await conn.query(
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

      return NextResponse.json({ ok: true, item: mrows?.[0] || null, attachments: attRows || [] });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
