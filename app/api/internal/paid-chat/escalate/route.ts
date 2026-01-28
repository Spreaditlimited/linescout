// app/api/internal/paid-chat/escalate/route.ts
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

function safeReason(x: string) {
  const r = String(x || "").trim().toLowerCase();
  const allowed = new Set([
    "policy_breach",
    "abuse",
    "sensitive_info",
    "payment_dispute",
    "complex_case",
    "other",
  ]);
  return allowed.has(r) ? r : "other";
}

/**
 * POST /api/internal/paid-chat/escalate
 * body: { conversation_id: number, reason?: string, note?: string, lock?: boolean }
 *
 * Creates an escalation ticket + optionally marks project_status='escalated'
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const reason = safeReason(body?.reason);
  const note = String(body?.note || "").trim().slice(0, 4000);
  const lock = body?.lock === false ? false : true; // default true

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure conversation exists + access rules (same as send/messages)
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

    // Agent restriction (admin bypass)
    if (auth.role !== "admin") {
      if (!assignedAgentId) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "This chat is unassigned. Claim it first." }, { status: 403 });
      }
      if (assignedAgentId !== auth.userId) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "You are not assigned to this conversation." }, { status: 403 });
      }
    }

    // Create escalation
    const [ins]: any = await conn.query(
      `
      INSERT INTO linescout_internal_escalations
        (conversation_id, handoff_id, created_by, created_by_role, reason, note)
      VALUES
        (?, ?, ?, ?, ?, ?)
      `,
      [conversationId, handoffId, auth.userId, auth.role, reason, note || null]
    );

    const escalationId = Number(ins?.insertId || 0);

    // Optional: lock project for agents by setting project_status='escalated'
    // (This does NOT cancel. It just signals "needs review".)
        await conn.query(
        `UPDATE linescout_conversations
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [conversationId]
        );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      escalation_id: escalationId,
      meta: {
        conversation_id: conversationId,
        handoff_id: handoffId,
        locked: lock,
        reason,
      },
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/escalate error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to escalate" }, { status: 500 });
  } finally {
    conn.release();
  }
}