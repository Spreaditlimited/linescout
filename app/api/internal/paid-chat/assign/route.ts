import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sendNoticeEmail } from "@/lib/notice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
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
      `SELECT u.id, u.username, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );
    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };
    return { ok: true as const };
  } finally {
    conn.release();
  }
}

async function ensureClaimBlockColumn(conn: any) {
  const [blockCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_conversations'
      AND column_name = 'claim_blocked_agent_id'
    LIMIT 1
    `
  );
  if (!blockCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_conversations ADD COLUMN claim_blocked_agent_id BIGINT UNSIGNED NULL`
    );
  }
}

async function ensureClaimAuditTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_handoff_claim_audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      handoff_id INT NOT NULL,
      conversation_id INT NULL,
      claimed_by_id INT NULL,
      claimed_by_name VARCHAR(120) NULL,
      claimed_by_role VARCHAR(32) NULL,
      previous_status VARCHAR(32) NULL,
      new_status VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_handoff_claim_handoff (handoff_id),
      INDEX idx_handoff_claim_created (created_at)
    )
    `
  );
}

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

/**
 * POST /api/internal/paid-chat/assign
 * body: { conversation_id: number, agent_id: number }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const agentId = Number(body?.agent_id || 0);

  if (!conversationId || !agentId) {
    return NextResponse.json(
      { ok: false, error: "conversation_id and agent_id are required" },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await ensureClaimBlockColumn(conn);
    await ensureClaimAuditTable(conn);

    const [agentRows]: any = await conn.query(
      `
      SELECT u.id, u.username, u.is_active, ap.approval_status, ap.email, ap.email_notifications_enabled
      FROM internal_users u
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [agentId]
    );
    const agent = agentRows?.[0];
    if (!agent?.id || Number(agent.is_active) !== 1 || String(agent.approval_status || "") !== "approved") {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Agent is not active or approved." }, { status: 400 });
    }

    const [rows]: any = await conn.query(
      `SELECT id, user_id, assigned_agent_id, chat_mode, payment_status, project_status, handoff_id, route_type
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
    const customerId = conv.user_id == null ? null : Number(conv.user_id);
    const handoffId = conv.handoff_id == null ? null : Number(conv.handoff_id);

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

    await conn.query(
      `UPDATE linescout_conversations
       SET assigned_agent_id = ?, claim_blocked_agent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [agentId, conversationId]
    );

    if (handoffId) {
      const [hrows]: any = await conn.query(
        `SELECT status FROM linescout_handoffs WHERE id = ? LIMIT 1`,
        [handoffId]
      );
      const prevStatus = String(hrows?.[0]?.status || "pending").trim().toLowerCase();

      await conn.query(
        `
        UPDATE linescout_handoffs
        SET status = 'claimed',
            claimed_by = ?,
            claimed_at = NOW()
        WHERE id = ?
          AND (status IN ('pending','claimed','manufacturer_found') OR status IS NULL)
        `,
        [String(agent.username || agentId), handoffId]
      );

      await conn.query(
        `
        INSERT INTO linescout_handoff_claim_audits
          (handoff_id, conversation_id, claimed_by_id, claimed_by_name, claimed_by_role,
           previous_status, new_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          handoffId,
          conversationId,
          agentId,
          agent.username || null,
          "agent",
          prevStatus || null,
          "claimed",
        ]
      );
    }

    await conn.commit();

    // Notify customer
    if (customerId) {
      try {
        const [urows]: any = await conn.query(`SELECT email FROM users WHERE id = ? LIMIT 1`, [customerId]);
        const email = String(urows?.[0]?.email || "").trim();
        const [trows]: any = await conn.query(
          `SELECT token FROM linescout_device_tokens WHERE is_active = 1 AND user_id = ?`,
          [customerId]
        );
        const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        await sendExpoPush(tokens, {
          title: "Your chat has been claimed",
          body: "A specialist has claimed your paid chat and will respond shortly.",
          data: { kind: "paid", conversation_id: conversationId },
        });
        if (email) {
          await sendNoticeEmail({
            to: email,
            subject: "Your LineScout paid chat has been claimed",
            title: "Paid chat claimed",
            lines: [
              "A specialist has claimed your paid chat and will respond shortly.",
              "Open the LineScout app to continue the conversation.",
            ],
            footerNote: "This email was sent because your paid chat was claimed on LineScout.",
          });
        }
      } catch {}
    }

    // Notify agent
    try {
      const agentEmail = String(agent.email || "").trim();
      if (agentEmail && Number(agent.email_notifications_enabled ?? 1) === 1) {
        await sendNoticeEmail({
          to: agentEmail,
          subject: "Paid chat assigned to you",
          title: "New paid chat assigned",
          lines: [
            `Conversation ID: ${conversationId}`,
            "Open the LineScout Agent app to respond.",
          ],
          footerNote: "This email was sent because a paid chat was assigned to you on LineScout.",
        });
      }
    } catch {}

    try {
      const [tokenRows]: any = await conn.query(
        `SELECT token FROM linescout_agent_device_tokens WHERE is_active = 1 AND agent_id = ?`,
        [agentId]
      );
      const tokens = (tokenRows || []).map((t: any) => String(t.token || "")).filter(Boolean);
      await sendExpoPush(tokens, {
        title: "New paid chat assigned",
        body: "A paid chat has been assigned to you. Open to respond.",
        data: { kind: "paid", conversation_id: conversationId },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      conversation_id: conversationId,
      assigned_agent_id: agentId,
      assigned_agent_username: String(agent.username || ""),
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/assign error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to assign conversation" }, { status: 500 });
  } finally {
    conn.release();
  }
}
