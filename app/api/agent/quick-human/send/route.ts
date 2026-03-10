// app/api/agent/quick-human/send/route.ts
import { NextResponse } from "next/server";
import { db, queryOne } from "@/lib/db";
import { sendNoticeEmail } from "@/lib/notice-email";
import type { RowDataPacket } from "mysql2/promise";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_MESSAGE =
  "Thank you for creating an account. Please go to your settings to complete all required sections. Our account approval team will review and approve your account so you can start claiming projects.";

type PermissionRow = RowDataPacket & { can_view_handoffs: number };

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  const messages = clean.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

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
        { ok: false, error: "ACCOUNT_APPROVAL_REQUIRED", approval_required: true, message: APPROVAL_MESSAGE },
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
          user_id,
          route_type,
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
      const userId = Number(c.user_id || 0);
      const routeType = String(c.route_type || "machine_sourcing");

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

      // Notify customer if they are not active in the conversation
      try {
        let shouldNotify = true;
        if (userId) {
          const [rrows]: any = await conn.query(
            `
            SELECT last_seen_message_id, updated_at
            FROM linescout_user_conversation_reads
            WHERE conversation_id = ? AND user_id = ?
            LIMIT 1
            `,
            [conversationId, userId]
          );
          const lastSeen = Number(rrows?.[0]?.last_seen_message_id || 0);
          const updatedAt = rrows?.[0]?.updated_at ? new Date(rrows[0].updated_at).getTime() : 0;
          const activeRecently = updatedAt && Date.now() - updatedAt < 2 * 60 * 1000;
          if (lastSeen >= messageId || activeRecently) shouldNotify = false;
        }

        if (shouldNotify && userId) {
          const [trows]: any = await conn.query(
            `
            SELECT token
            FROM linescout_device_tokens
            WHERE is_active = 1 AND user_id = ?
            `,
            [userId]
          );
          const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
          const preview = (messageText || "Attachment").trim().slice(0, 120);
          await sendExpoPush(tokens, {
            title: "New quick chat message",
            body: preview || "Attachment",
            data: { kind: "quick_human", conversation_id: conversationId, route_type: routeType },
          });

          const [emailRows]: any = await conn.query(
            `
            SELECT email
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [userId]
          );
          const email = String(emailRows?.[0]?.email || "").trim();
          if (email) {
            const chatUrl = `https://linescout.sureimports.com/quick-chat?route_type=${encodeURIComponent(routeType)}&conversation_id=${conversationId}`;
            await sendNoticeEmail({
              to: email,
              subject: "New quick chat message",
              title: "New quick chat message",
              lines: [
                "A specialist sent a new message in your quick chat.",
                `Conversation ID: ${conversationId}`,
                `Preview: ${preview || "Attachment"}`,
              ],
              ctaLabel: "Open chat",
              ctaUrl: chatUrl,
              footerNote:
                "This email was sent because a quick chat received a new message on LineScout.",
            });
          }
        }
      } catch {}

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
