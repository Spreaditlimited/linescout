// app/api/internal/paid-chat/claim/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same internal auth rule you used:
 * Admin OR agent with can_view_leads=1.
 */
async function requireInternalAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
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

    if (!rows?.length) {
      return { ok: false as const, status: 401 as const, error: "Invalid session" };
    }

    const userId = Number(rows[0].id);
    const username = String(rows[0].username || "");
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) {
      return { ok: true as const, userId, username, role };
    }

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/paid-chat/claim
 * body: { conversation_id: number }
 *
 * If assigned_agent_id is NULL, set it to current internal user (agent/admin).
 * If already assigned:
 *  - admin can "take over" by setting assigned_agent_id to themselves
 *  - agent cannot override (returns current assignment)
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (auth.role !== "admin") {
      const [limitRows]: any = await conn.query(
        `
        SELECT COUNT(*) AS n
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.assigned_agent_id = ?
          AND c.handoff_id IS NOT NULL
          AND c.project_status = 'active'
          AND (h.shipped_at IS NULL)
        `,
        [auth.userId]
      );

      const ongoing = Number(limitRows?.[0]?.n || 0);
      if (ongoing >= 3) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "You already have 3 ongoing projects. Complete or ship one before claiming a new project." },
          { status: 403 }
        );
      }
    }

    const [rows]: any = await conn.query(
      `SELECT id, assigned_agent_id, chat_mode, payment_status, project_status, handoff_id
       FROM linescout_conversations
       WHERE id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!rows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = rows[0];
    const assigned = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);

    // Only claim paid chats that are active
    const chatMode = String(conv.chat_mode || "");
    const paymentStatus = String(conv.payment_status || "");
    const projectStatus = String(conv.project_status || "");

    if (chatMode !== "paid_human" || paymentStatus !== "paid") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }

    if (projectStatus === "cancelled") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    // If already assigned
    if (assigned) {
      if (auth.role === "admin" && assigned !== auth.userId) {
        // Admin can take over
        await conn.query(
          `UPDATE linescout_conversations
           SET assigned_agent_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [auth.userId, conversationId]
        );
        await conn.commit();
        return NextResponse.json({ ok: true, conversation_id: conversationId, assigned_agent_id: auth.userId, taken_over: true });
      }

      await conn.commit();
      return NextResponse.json({ ok: true, conversation_id: conversationId, assigned_agent_id: assigned, already_assigned: true });
    }

    // Not assigned: claim it
    await conn.query(
      `UPDATE linescout_conversations
       SET assigned_agent_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND assigned_agent_id IS NULL`,
      [auth.userId, conversationId]
    );

    if (conv.handoff_id) {
      await conn.query(
        `
        UPDATE linescout_handoffs
        SET status = 'claimed',
            claimed_by = ?,
            claimed_at = NOW()
        WHERE id = ?
          AND (status = 'pending' OR status IS NULL)
        `,
        [auth.username || String(auth.userId), conv.handoff_id]
      );
    }

    // Re-read to confirm winner (handles race conditions)
    const [afterRows]: any = await conn.query(
      `SELECT assigned_agent_id FROM linescout_conversations WHERE id = ? LIMIT 1`,
      [conversationId]
    );

    const finalAssigned =
      afterRows?.[0]?.assigned_agent_id == null ? null : Number(afterRows[0].assigned_agent_id);

    await conn.commit();

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      assigned_agent_id: finalAssigned,
      claimed: finalAssigned === auth.userId,
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/claim error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to claim conversation" }, { status: 500 });
  } finally {
    conn.release();
  }
}