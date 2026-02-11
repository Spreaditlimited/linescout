// app/api/agent/quick-human/messages/route.ts
import { NextResponse } from "next/server";
import { db, queryOne } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { requireAgent } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_MESSAGE =
  "Thank you for creating an account. Please go to your settings to complete all required sections. Our account approval team will review and approve your account so you can start claiming projects.";

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

export async function GET(req: Request) {
  try {
    const agent = await requireAgent(req);
    const approved = await ensureApprovedAgent(Number(agent.id), String(agent.role || ""));
    if (!approved) {
      return NextResponse.json(
        { ok: false, error: "ACCOUNT_APPROVAL_REQUIRED", approval_required: true, message: APPROVAL_MESSAGE },
        { status: 403 }
      );
    }

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
      // Ensure this is a quick-human conversation
      const [crows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.conversation_kind,
          c.project_status,
          c.chat_mode,
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
        WHERE c.id = ?
          AND c.conversation_kind = 'quick_human'
        LIMIT 1
        `,
        [conversationId]
      );

      if (!crows?.length) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      // Messages
      let rows: any[] = [];
      let hasMore = false;

      if (beforeId > 0) {
        const [res]: any = await conn.query(
          `
          SELECT
            id,
            conversation_id,
            sender_type,
            sender_id,
            message_text,
            created_at
          FROM linescout_messages
          WHERE conversation_id = ?
            AND id < ?
          ORDER BY id DESC
          LIMIT ?
          `,
          [conversationId, beforeId, limit + 1]
        );
        rows = res || [];
        if (rows.length > limit) {
          hasMore = true;
          rows = rows.slice(0, limit);
        }
        rows = rows.reverse();
      } else if (afterId > 0) {
        const [res]: any = await conn.query(
          `
          SELECT
            id,
            conversation_id,
            sender_type,
            sender_id,
            message_text,
            created_at
          FROM linescout_messages
          WHERE conversation_id = ?
            AND id > ?
          ORDER BY id ASC
          LIMIT ?
          `,
          [conversationId, afterId, limit]
        );
        rows = res || [];
      } else {
        const [res]: any = await conn.query(
          `
          SELECT
            id,
            conversation_id,
            sender_type,
            sender_id,
            message_text,
            created_at
          FROM linescout_messages
          WHERE conversation_id = ?
          ORDER BY id DESC
          LIMIT ?
          `,
          [conversationId, limit + 1]
        );
        rows = res || [];
        if (rows.length > limit) {
          hasMore = true;
          rows = rows.slice(0, limit);
        }
        rows = rows.reverse();
      }

      const lastId = rows?.length ? Number(rows[rows.length - 1].id) : afterId;

      const ids = (rows || [])
        .map((r: any) => Number(r.id))
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
        conversation_id: conversationId,
        items: rows || [],
        meta: {
          customer_name: String(crows[0].customer_name || "Customer"),
          agent_name: String(agent.name || "Agent"),
        },
        last_id: lastId,
        attachments,
        attachments_by_message_id: attachmentsByMessageId,
        has_more: hasMore,
      });
    } catch (e: any) {
      console.error("GET /api/agent/quick-human/messages error:", e?.message || e);
      return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
