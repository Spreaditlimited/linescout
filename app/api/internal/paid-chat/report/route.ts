// app/api/internal/paid-chat/report/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
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

function safeCategory(x: string) {
  const c = String(x || "").trim().toLowerCase();
  const allowed = new Set([
    "bank_details_shared",
    "personal_data_shared",
    "abuse",
    "harassment",
    "scam_attempt",
    "illegal_request",
    "policy_breach",
    "other",
  ]);
  return allowed.has(c) ? c : "other";
}

/**
 * POST /api/internal/paid-chat/report
 * body: {
 *   conversation_id: number,
 *   category?: string,
 *   note?: string,
 *   message_id?: number,
 *   attachment_id?: number
 * }
 *
 * Logs a report record. Does NOT lock project.
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const category = safeCategory(body?.category);
  const note = String(body?.note || "").trim().slice(0, 4000);

  const messageId = body?.message_id != null ? Number(body.message_id) : null;
  const attachmentId = body?.attachment_id != null ? Number(body.attachment_id) : null;

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure conversation exists + permission rules
    const [convRows]: any = await conn.query(
      `
      SELECT
        c.id,
        c.chat_mode,
        c.payment_status,
        c.project_status,
        c.assigned_agent_id,
        c.handoff_id
      FROM linescout_conversations c
      WHERE c.id = ?
      LIMIT 1
      `,
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
    const handoffId = conv.handoff_id == null ? null : Number(conv.handoff_id);

    if (chatMode !== "paid_human" || paymentStatus !== "paid") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (projectStatus === "cancelled") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    // Agent restriction (admin bypass): allow assigned-to-me OR unassigned (same as messages route)
    if (auth.role !== "admin") {
      if (assignedAgentId && assignedAgentId !== auth.userId) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "You are not assigned to this conversation." }, { status: 403 });
      }
    }

    // Optional: validate message_id belongs to this conversation
    if (messageId) {
      const [mrows]: any = await conn.query(
        `SELECT id FROM linescout_messages WHERE id = ? AND conversation_id = ? LIMIT 1`,
        [messageId, conversationId]
      );
      if (!mrows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "message_id not found for this conversation" }, { status: 400 });
      }
    }

    // Optional: validate attachment_id belongs to this conversation
    if (attachmentId) {
      const [arows]: any = await conn.query(
        `SELECT id FROM linescout_message_attachments WHERE id = ? AND conversation_id = ? LIMIT 1`,
        [attachmentId, conversationId]
      );
      if (!arows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "attachment_id not found for this conversation" }, { status: 400 });
      }
    }

    const [ins]: any = await conn.query(
      `
      INSERT INTO linescout_internal_reports
        (conversation_id, handoff_id, reported_by, reported_by_role, category, note, message_id, attachment_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        conversationId,
        handoffId,
        auth.userId,
        auth.role,
        category,
        note || null,
        messageId,
        attachmentId,
      ]
    );

    const reportId = Number(ins?.insertId || 0);

    // Touch conversation for visibility in inbox ordering
    await conn.query(
      `UPDATE linescout_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [conversationId]
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      report_id: reportId,
      meta: { conversation_id: conversationId, handoff_id: handoffId, category },
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/report error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to file report" }, { status: 500 });
  } finally {
    conn.release();
  }
}