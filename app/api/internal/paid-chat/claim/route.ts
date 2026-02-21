// app/api/internal/paid-chat/claim/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Transporter } from "nodemailer";
import { buildNoticeEmail } from "@/lib/otp-email";
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureClaimLimitColumns(conn: any) {
  const [settingsCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'max_active_claims'
    LIMIT 1
    `
  );
  if (!settingsCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN max_active_claims INT NOT NULL DEFAULT 3`
    );
  }

  const [permCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'internal_user_permissions'
      AND column_name = 'claim_limit_override'
    LIMIT 1
    `
  );
  if (!permCols?.length) {
    await conn.query(
      `ALTER TABLE internal_user_permissions ADD COLUMN claim_limit_override INT NULL`
    );
  }

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

function buildClaimedEmail() {
  return buildNoticeEmail({
    subject: "Your LineScout paid chat has been claimed",
    title: "Paid chat claimed",
    lines: [
      "A specialist has claimed your paid chat and will respond shortly.",
      "Open the LineScout app to continue the conversation.",
    ],
    footerNote: "This email was sent because your paid chat was claimed on LineScout.",
  });
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  return { ok: true as const, host, port, user, pass, from };
}

async function sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) return { ok: false as const, error: smtp.error };

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
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
    await ensureClaimAuditTable(conn);

    if (auth.role !== "admin") {
      await ensureClaimLimitColumns(conn);

      const [settingsRows]: any = await conn.query(
        `SELECT max_active_claims FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const globalLimit = Number(settingsRows?.[0]?.max_active_claims || 3);

      const [overrideRows]: any = await conn.query(
        `SELECT claim_limit_override FROM internal_user_permissions WHERE user_id = ? LIMIT 1`,
        [auth.userId]
      );
      const overrideLimit = overrideRows?.[0]?.claim_limit_override;
      const effectiveLimit =
        Number.isFinite(Number(overrideLimit)) && Number(overrideLimit) > 0
          ? Number(overrideLimit)
          : globalLimit;

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
      if (ongoing >= effectiveLimit) {
        await conn.rollback();
        return NextResponse.json(
          {
            ok: false,
            error: `You already have ${effectiveLimit} ongoing projects. Complete or ship one before claiming a new project.`,
          },
          { status: 403 }
        );
      }
    }

    const [rows]: any = await conn.query(
      `SELECT id, user_id, assigned_agent_id, chat_mode, payment_status, project_status, handoff_id, claim_blocked_agent_id
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
    const customerId = conv.user_id == null ? null : Number(conv.user_id);
    const blockedAgentId =
      conv.claim_blocked_agent_id == null ? null : Number(conv.claim_blocked_agent_id);

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

    if (auth.role !== "admin" && blockedAgentId && blockedAgentId === auth.userId) {
      await conn.rollback();
      return NextResponse.json(
        {
          ok: false,
          error:
            "You cannot claim this project because it was returned to the pool by admin. Please claim another project.",
        },
        { status: 403 }
      );
    }

    // If already assigned
    if (assigned) {
      if (auth.role === "admin" && assigned !== auth.userId) {
        // Admin can take over
        await conn.query(
          `UPDATE linescout_conversations
           SET assigned_agent_id = ?, claim_blocked_agent_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [auth.userId, conversationId]
        );
        await conn.commit();

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
              const mail = buildClaimedEmail();
              await sendEmail({
                to: email,
                subject: mail.subject,
                text: mail.text,
                html: mail.html,
              });
            }
          } catch {}
        }
        return NextResponse.json({ ok: true, conversation_id: conversationId, assigned_agent_id: auth.userId, taken_over: true });
      }

      await conn.commit();
      return NextResponse.json({ ok: true, conversation_id: conversationId, assigned_agent_id: assigned, already_assigned: true });
    }

    // Not assigned: claim it
    await conn.query(
      `UPDATE linescout_conversations
       SET assigned_agent_id = ?, claim_blocked_agent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND assigned_agent_id IS NULL`,
      [auth.userId, conversationId]
    );

    if (conv.handoff_id) {
      const [hrows]: any = await conn.query(
        `SELECT status
         FROM linescout_handoffs
         WHERE id = ?
         LIMIT 1`,
        [conv.handoff_id]
      );
      const prevStatus = String(hrows?.[0]?.status || "pending").trim().toLowerCase();
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

      await conn.query(
        `
        INSERT INTO linescout_handoff_claim_audits
          (handoff_id, conversation_id, claimed_by_id, claimed_by_name, claimed_by_role,
           previous_status, new_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          conv.handoff_id,
          conversationId,
          auth.userId,
          auth.username || null,
          auth.role || null,
          prevStatus || null,
          "claimed",
        ]
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

    if (finalAssigned === auth.userId && customerId) {
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
          const mail = buildClaimedEmail();
          await sendEmail({
            to: email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
        }
      } catch {}
    }

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
