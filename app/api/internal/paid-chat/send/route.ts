// app/api/internal/paid-chat/send/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type IncomingUploadFile = {
  url: string; // secure url from upload route
  public_id: string;
  mime?: string | null;
  bytes?: number | null;
  original_name?: string | null;
};

function readSessionToken(req: Request, cookieName: string) {
  const bearer = req.headers.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  return headerToken || cookieToken;
}

async function requireInternalAccess(req: Request) {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const token =
    readSessionToken(req, cookieName) || (await cookies()).get(cookieName)?.value || "";
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         u.is_active,
         COALESCE(p.can_view_leads, 0) AS can_view_leads
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) return { ok: true as const, userId, role };

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
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

  return {
    hasFile: Boolean(url && publicId),
    url,
    publicId,
    mime,
    bytes,
    originalName,
  };
}

/**
 * POST /api/internal/paid-chat/send
 * body:
 * {
 *   conversation_id: number,
 *   message_text?: string,
 *   file?: { url, public_id, mime?, bytes?, original_name? } // from internal upload route
 * }
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const messageText = String(body?.message_text || "").trim();
  const replyToId = Number(body?.reply_to_message_id || 0);

  const file = normalizeFile(body);

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const hasText = messageText.length > 0;
  const hasFile = file.hasFile;

  // must have text OR file OR both
  if (!hasText && !hasFile) {
    return NextResponse.json(
      { ok: false, error: "message_text or file is required" },
      { status: 400 }
    );
  }

  if (messageText.length > 8000) {
    return NextResponse.json({ ok: false, error: "message_text too long" }, { status: 400 });
  }

  // defensive size guard (keep consistent with upload route)
  if (hasFile && file.bytes) {
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

    // 1) Ensure paid conversation and active
    const [convRows]: any = await conn.query(
      `SELECT id, chat_mode, payment_status, project_status, assigned_agent_id
       FROM linescout_conversations
       WHERE id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!convRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = convRows[0];
    const chatMode = String(conv.chat_mode || "");
    const paymentStatus = String(conv.payment_status || "");
    const projectStatus = String(conv.project_status || "");
    const assignedAgentId = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);

    if (chatMode !== "paid_human" || paymentStatus !== "paid") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (projectStatus === "cancelled") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    // 2) Guard: agents can send only if assigned to them (admin bypass)
    if (auth.role !== "admin") {
      if (!assignedAgentId) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "This chat is unassigned. Claim it first." },
          { status: 403 }
        );
      }
      if (auth.userId !== assignedAgentId) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "You are not assigned to this conversation." },
          { status: 403 }
        );
      }
    }

    let replyToMessageId: number | null = null;
    let replyToSenderType: string | null = null;
    let replyToText: string | null = null;
    if (replyToId) {
      const [replyRows]: any = await conn.query(
        `
        SELECT id, sender_type, message_text
        FROM linescout_messages
        WHERE id = ? AND conversation_id = ?
        LIMIT 1
        `,
        [replyToId, conversationId]
      );
      if (replyRows?.length) {
        replyToMessageId = Number(replyRows[0].id);
        replyToSenderType = String(replyRows[0].sender_type || "");
        replyToText = String(replyRows[0].message_text || "").trim().slice(0, 280);
      }
    }

    // 3) Insert agent message (allow blank text if file exists)
    const [ins]: any = await conn.query(
      `INSERT INTO linescout_messages
         (conversation_id, sender_type, sender_id, message_text, reply_to_message_id, reply_to_sender_type, reply_to_text)
       VALUES
         (?, 'agent', ?, ?, ?, ?, ?)`,
      [
        conversationId,
        auth.userId,
        hasText ? messageText : "",
        replyToMessageId,
        replyToSenderType,
        replyToText,
      ]
    );

    const messageId = Number(ins?.insertId || 0);

    // 4) If file present, insert attachment row
    if (hasFile) {
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
          auth.userId,
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

    // 5) Touch conversation updated_at
    await conn.query(`UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      conversationId,
    ]);

    // 6) Return inserted message + its attachments
    const [rows]: any = await conn.query(
      `SELECT id, conversation_id, sender_type, sender_id, message_text, reply_to_message_id, reply_to_sender_type, reply_to_text, created_at
       FROM linescout_messages
       WHERE id = ?
       LIMIT 1`,
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

    // Notify customer if they are not active
    try {
      const [userRows]: any = await conn.query(
        `SELECT user_id FROM linescout_conversations WHERE id = ? LIMIT 1`,
        [conversationId]
      );
      const customerId = userRows?.[0]?.user_id ? Number(userRows[0].user_id) : null;

      if (customerId) {
        let shouldNotify = true;
        const [rrows]: any = await conn.query(
          `
          SELECT last_seen_message_id, updated_at
          FROM linescout_user_conversation_reads
          WHERE conversation_id = ? AND user_id = ?
          LIMIT 1
          `,
          [conversationId, customerId]
        );
        const lastSeen = Number(rrows?.[0]?.last_seen_message_id || 0);
        const updatedAt = rrows?.[0]?.updated_at ? new Date(rrows[0].updated_at).getTime() : 0;
        const activeRecently = updatedAt && Date.now() - updatedAt < 2 * 60 * 1000;
        if (lastSeen >= messageId || activeRecently) shouldNotify = false;

        if (shouldNotify) {
          const [trows]: any = await conn.query(
            `
            SELECT token
            FROM linescout_device_tokens
            WHERE is_active = 1 AND user_id = ?
            `,
            [customerId]
          );
          const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
          await sendExpoPush(tokens, {
            title: "New message from your agent",
            body: (hasText ? messageText : "Attachment").slice(0, 120),
            data: { kind: "paid", conversation_id: conversationId },
          });
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, item: rows?.[0] || null, attachments: attRows || [] });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/send error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to send agent message" }, { status: 500 });
  } finally {
    conn.release();
  }
}
