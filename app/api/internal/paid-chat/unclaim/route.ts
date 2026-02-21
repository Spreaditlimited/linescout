// app/api/internal/paid-chat/unclaim/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Transporter } from "nodemailer";
import { buildNoticeEmail } from "@/lib/otp-email";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function ensureReleaseAuditTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_handoff_release_audits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      handoff_id INT NOT NULL,
      conversation_id INT NULL,
      released_by_id INT NULL,
      released_by_name VARCHAR(120) NULL,
      released_by_role VARCHAR(32) NULL,
      previous_status VARCHAR(32) NULL,
      product_paid DECIMAL(18,2) NULL,
      shipping_paid DECIMAL(18,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_handoff_release_handoff (handoff_id),
      INDEX idx_handoff_release_created (created_at)
    )
    `
  );
}
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
 * POST /api/internal/paid-chat/unclaim
 * body: { conversation_id: number }
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
    await ensureClaimBlockColumn(conn);
    await ensureReleaseAuditTable(conn);

    const [rows]: any = await conn.query(
      `SELECT id, assigned_agent_id, handoff_id, project_status, route_type
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
    const handoffId = conv.handoff_id == null ? null : Number(conv.handoff_id);

    if (!assigned) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Project is not assigned." }, { status: 400 });
    }

    if (auth.role !== "admin" && assigned !== auth.userId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "You can only release your own projects." }, { status: 403 });
    }

    if (handoffId) {
      const [hrows]: any = await conn.query(
        `SELECT status FROM linescout_handoffs WHERE id = ? LIMIT 1`,
        [handoffId]
      );
      const status = String(hrows?.[0]?.status || "pending").trim().toLowerCase();
      if (!["claimed", "manufacturer_found", ""].includes(status)) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "You can only release projects that are claimed or manufacturer found." },
          { status: 403 }
        );
      }

      const [payRows]: any = await conn.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN qp.purpose IN ('product_balance','full_product_payment') AND qp.status = 'paid' THEN qp.amount ELSE 0 END), 0) AS product_paid,
          COALESCE(SUM(CASE WHEN qp.purpose = 'shipping_payment' AND qp.status = 'paid' THEN qp.amount ELSE 0 END), 0) AS shipping_paid
        FROM linescout_quotes q
        JOIN linescout_quote_payments qp ON qp.quote_id = q.id
        WHERE q.handoff_id = ?
        `,
        [handoffId]
      );
      const productPaid = Number(payRows?.[0]?.product_paid || 0);
      const shippingPaid = Number(payRows?.[0]?.shipping_paid || 0);
      if (productPaid > 0 || shippingPaid > 0) {
        await conn.rollback();
        return NextResponse.json(
          {
            ok: false,
            error:
              "Cannot release this project because product or shipping payment has already started.",
          },
          { status: 403 }
        );
      }

      const [quoteRows]: any = await conn.query(
        `SELECT id FROM linescout_quotes WHERE handoff_id = ?`,
        [handoffId]
      );
      const quoteIds = (quoteRows || []).map((r: any) => Number(r.id)).filter((id: number) => id > 0);

      // Record audit before releasing
      await conn.query(
        `
        INSERT INTO linescout_handoff_release_audits
          (handoff_id, conversation_id, released_by_id, released_by_name, released_by_role,
           previous_status, product_paid, shipping_paid, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          handoffId,
          conversationId,
          auth.userId,
          auth.username || null,
          auth.role || null,
          status || null,
          productPaid,
          shippingPaid,
        ]
      );

      if (quoteIds.length) {
        await conn.query(
          `DELETE FROM linescout_quote_payments WHERE quote_id IN (${quoteIds.map(() => "?").join(", ")})`,
          quoteIds
        );
        await conn.query(
          `DELETE FROM linescout_quotes WHERE id IN (${quoteIds.map(() => "?").join(", ")})`,
          quoteIds
        );
      }
    }

    const blockAgentId = auth.role === "admin" ? assigned : null;
    await conn.query(
      `UPDATE linescout_conversations
       SET assigned_agent_id = NULL, claim_blocked_agent_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_agent_id = ?`,
      [blockAgentId, conversationId, assigned]
    );

    if (handoffId) {
      await conn.query(
        `
        UPDATE linescout_handoffs
        SET status = 'pending',
            claimed_by = NULL,
            claimed_at = NULL
        WHERE id = ?
          AND (status = 'claimed' OR status = 'manufacturer_found' OR status IS NULL)
        `,
        [handoffId]
      );
    }

    await conn.commit();

    if (auth.role === "admin" && handoffId) {
      try {
        const [handoffRows]: any = await conn.query(
          `SELECT token, handoff_type, customer_name FROM linescout_handoffs WHERE id = ? LIMIT 1`,
          [handoffId]
        );
        const h = handoffRows?.[0] || null;
        const customerLabel =
          (h?.customer_name ? String(h.customer_name).trim() : "") || "Customer";
        const handoffLabel = h?.token ? String(h.token).trim() : `Handoff #${handoffId}`;
        const routeType = String(h?.handoff_type || conv.route_type || "sourcing").trim();

        const [trows]: any = await conn.query(
          `
          SELECT t.token
          FROM linescout_agent_device_tokens t
          JOIN internal_users u ON u.id = t.agent_id
          JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
          WHERE t.is_active = 1
            AND u.is_active = 1
            AND ap.approval_status = 'approved'
          `
        );
        const tokens = (trows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        await sendExpoPush(tokens, {
          title: "New paid chat available",
          body: `${customerLabel} has a paid chat ready to claim.`,
          data: { kind: "paid", conversation_id: conversationId, handoff_id: handoffId, route_type: routeType },
        });

        const [emailRows]: any = await conn.query(
          `
          SELECT ap.email
          FROM linescout_agent_profiles ap
          JOIN internal_users u ON u.id = ap.internal_user_id
          WHERE u.is_active = 1
            AND ap.approval_status = 'approved'
            AND COALESCE(ap.email_notifications_enabled, 1) = 1
            AND ap.email IS NOT NULL
            AND ap.email <> ''
          `
        );
        const emails = (emailRows || [])
          .map((r: any) => String(r.email || "").trim())
          .filter(Boolean);

        for (const email of emails) {
          const mail = buildNoticeEmail({
            subject: "New paid chat available",
            title: "New paid chat",
            lines: [
              `${customerLabel} has a paid chat ready to claim.`,
              `Route: ${routeType}`,
              `Handoff: ${handoffLabel}`,
              "Open the LineScout Agent app to claim this project.",
            ],
            footerNote:
              "This email was sent because a paid chat was returned to the pool for LineScout agents.",
          });
          await sendEmail({
            to: email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, conversation_id: conversationId, released: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/unclaim error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to release project" }, { status: 500 });
  } finally {
    conn.release();
  }
}
