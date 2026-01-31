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

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    if (!messageText) {
      return NextResponse.json({ ok: false, error: "message_text is required" }, { status: 400 });
    }

    if (messageText.length > 8000) {
      return NextResponse.json({ ok: false, error: "message_text too long" }, { status: 400 });
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
        [conversationId, Number(agent.id), messageText]
      );

      const messageId = Number(ins?.insertId || 0);

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

      await conn.commit();

      return NextResponse.json({ ok: true, item: mrows?.[0] || null });
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
