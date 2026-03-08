import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { buildNoticeEmail } from "@/lib/otp-email";
import {
  ensureCountryConfig,
  ensureHandoffCountryColumns,
  backfillHandoffDefaults,
  getNigeriaDefaults,
} from "@/lib/country-config";
import { convertAmount } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

const N8N_STATUS_NOTIFY_URL =
  process.env.N8N_STATUS_NOTIFY_URL ||
  "https://n8n.sureimports.com/webhook/linescout_status_notify";

function db() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  });
}

function randomChunk(len: number) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function generateSourcingToken() {
  return `SRC-${randomChunk(6)}-${randomChunk(5)}`;
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function routeLabel(v: string) {
  if (v === "white_label") return "White label";
  if (v === "simple_sourcing") return "Simple sourcing";
  return "Machine sourcing";
}

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  const chunkSize = 100;
  for (let i = 0; i < clean.length; i += chunkSize) {
    const batch = clean.slice(i, i + chunkSize);
    const messages = batch.map((to) => ({
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

async function sendEmail(opts: { to: string; replyTo?: string; subject: string; text: string; html: string }) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) return { ok: false as const, error: smtp.error };

  const transporter = (await import("nodemailer")).default.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
}

// Fire-and-forget (never block DB commit)
async function notifyStatusEmail(payload: any) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);

    await fetch(N8N_STATUS_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(t);
  } catch {
    // ignore
  }
}

/**
 * POST /api/linescout-handoffs/manual
 * Body:
 * {
 *   user_id?: number (optional; preferred)
 *   customer_name: string (required)
 *   customer_email: string (required)
 *   customer_phone?: string | null
 *   whatsapp_number?: string | null
 *   notes?: string | null
 *   status?: string | null         (optional, default "pending")
 *   currency?: string | null       (optional, default "NGN")
 *   route_type?: "machine_sourcing" | "white_label" | "simple_sourcing" (optional)
 *   total_due?: number | null      (optional)
 *   payment_source: "paystack" | "paypal" (required)
 *   payment_ref: string (required)
 * }
 */
export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json().catch(() => ({}));

    let customer_name = String(body.customer_name || "").trim();
    let customer_email = String(body.customer_email || "").trim();
    const providedUserId = Number(body.user_id || 0);
    const customer_phone = body.customer_phone ? String(body.customer_phone).trim() : null;

    const whatsapp_number = body.whatsapp_number ? String(body.whatsapp_number).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // Handoff status is separate from token status. Default is pending.
    const status = String(body.status || "pending").trim() || "pending";

    const currency = String(body.currency || "NGN").trim() || "NGN";
    const routeTypeRaw = String(body.route_type || "machine_sourcing").trim();
    const routeType: RouteType = isValidRouteType(routeTypeRaw) ? (routeTypeRaw as RouteType) : "machine_sourcing";

    const total_due =
      body.total_due === null || body.total_due === undefined ? null : Number(body.total_due);
    const paymentSource = String(body.payment_source || "").trim().toLowerCase();
    const paymentRef = String(body.payment_ref || "").trim();

    if (!customer_name) {
      return NextResponse.json({ ok: false, error: "customer_name is required" }, { status: 400 });
    }
    if (!customer_email || !customer_email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid customer_email is required" }, { status: 400 });
    }
    if (total_due !== null && (Number.isNaN(total_due) || total_due < 0)) {
      return NextResponse.json({ ok: false, error: "total_due must be >= 0" }, { status: 400 });
    }
    if (paymentSource !== "paystack" && paymentSource !== "paypal") {
      return NextResponse.json({ ok: false, error: "payment_source must be paystack or paypal" }, { status: 400 });
    }
    if (!paymentRef) {
      return NextResponse.json({ ok: false, error: "payment_ref is required" }, { status: 400 });
    }

    conn = await db();
    await conn.beginTransaction();
    await ensureCountryConfig(conn as any);
    await ensureHandoffCountryColumns(conn as any);
    await backfillHandoffDefaults(conn as any);

    const defaults = await getNigeriaDefaults(conn as any);

    // 1) Resolve commitment fee (system-configured amount)
    const [settingsRows]: any = await conn.query(
      "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
    );
    const commitmentDueNgn = Number(settingsRows?.[0]?.commitment_due_ngn || 0);
    if (!Number.isFinite(commitmentDueNgn) || commitmentDueNgn <= 0) {
      await conn.rollback();
      return NextResponse.json(
        { ok: false, error: "Commitment fee is not configured. Update settings first." },
        { status: 500 }
      );
    }

    // 2) Resolve user for conversation (required for project creation)
    const [userRows]: any = await conn.query(
      `
      SELECT u.id, u.email, u.display_name, u.country_id, u.display_currency_code
      FROM users u
      WHERE ${providedUserId ? "u.id = ?" : "u.email = ?"}
      LIMIT 1
      `,
      [providedUserId ? providedUserId : customer_email]
    );
    const userId = Number(userRows?.[0]?.id || 0);
    if (!userId) {
      await conn.rollback();
      return NextResponse.json(
        { ok: false, error: "No user found for this email. Ask the customer to sign up first." },
        { status: 400 }
      );
    }
    if (userRows?.[0]?.email) {
      customer_email = String(userRows[0].email || "").trim();
    }
    if (userRows?.[0]?.display_name) {
      customer_name = String(userRows[0].display_name || "").trim();
    }

    // Block duplicate manual handoffs for same user in a short interval (10 minutes)
    const [recentRows]: any = await conn.query(
      `
      SELECT id, created_at
      FROM linescout_handoffs
      WHERE email = ?
        AND created_at >= (NOW() - INTERVAL 10 MINUTE)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [customer_email]
    );
    if (recentRows?.length) {
      await conn.rollback();
      return NextResponse.json(
        { ok: false, error: "A handoff was created for this user recently. Please wait a few minutes and retry." },
        { status: 409 }
      );
    }

    const userCountryId = Number(userRows?.[0]?.country_id || 0) || null;
    const userDisplayCurrency = String(userRows?.[0]?.display_currency_code || "")
      .trim()
      .toUpperCase();
    const paypalCurrency = userDisplayCurrency || "GBP";

    let paymentAmount = commitmentDueNgn;
    let paymentCurrency = "NGN";
    if (paymentSource === "paypal") {
      if (paypalCurrency === "NGN") {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "PayPal is not available for NGN. Please use Paystack." },
          { status: 400 }
        );
      }
      const converted = await convertAmount(conn as any, commitmentDueNgn, "NGN", paypalCurrency);
      if (!converted || !Number.isFinite(converted) || converted <= 0) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: `${paypalCurrency} exchange rate is not configured.` },
          { status: 500 }
        );
      }
      paymentAmount = Number(converted.toFixed(2));
      paymentCurrency = paypalCurrency;
    }

    const finalCurrency = paymentCurrency;
    const displayCurrency = finalCurrency || defaults.display_currency_code;
    const settlementCurrency = finalCurrency || defaults.settlement_currency_code;
    const countryId = userCountryId || defaults.country_id;

    // Ensure payment ref isn't reused
    if (paymentSource === "paystack") {
      const [refRows]: any = await conn.query(
        `SELECT id FROM linescout_tokens WHERE paystack_ref = ? LIMIT 1`,
        [paymentRef]
      );
      if (refRows?.length) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "This Paystack reference has already been used." },
          { status: 409 }
        );
      }
    }

    // 3) Create token record matching production logic
    // type MUST be "sourcing"
    // token format MUST be SRC-XXXXXX-YYYYY
    // expires_at: now + 14 days
    const now = new Date();
    const expiresAt = addDays(now, 14);

    let token = "";
    for (let i = 0; i < 5; i++) {
      const t = generateSourcingToken();
      try {
        await conn.query(
          `INSERT INTO linescout_tokens
           (token, type, email, amount, currency, paystack_ref, status, metadata, expires_at, customer_name, customer_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t,
            "sourcing",
            customer_email,
            paymentAmount,
            paymentCurrency,
            paymentSource === "paystack" ? paymentRef : null,
            "valid",
            JSON.stringify({
              source: "manual_admin",
              created_via: "admin_settings",
              created_at: now.toISOString(),
              note: "Manual project creation after in-app payment",
              payment_source: paymentSource,
              paystack: paymentSource === "paystack" ? { reference: paymentRef } : undefined,
              paypal: paymentSource === "paypal" ? { order_id: paymentRef } : undefined,
            }),
            expiresAt,
            customer_name,
            customer_phone,
          ]
        );
        token = t;
        break;
      } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("duplicate")) continue;

        console.error("manual token insert error", e);
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Failed to create token" }, { status: 500 });
      }
    }

    if (!token) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Failed to generate a unique token" }, { status: 500 });
    }

    // 4) Create paid conversation
    const [convIns]: any = await conn.query(
      `
      INSERT INTO linescout_conversations
        (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status, project_status)
      VALUES
        (?, ?, 'paid_human', 0, 0, 'paid', 'active')
      `,
      [userId, routeType]
    );
    const conversationId = Number(convIns?.insertId || 0);
    if (!conversationId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Failed to create conversation" }, { status: 500 });
    }

    // 5) Create handoff record (handoff_type MUST be "sourcing")
    const [handoffInsert]: any = await conn.query(
      `INSERT INTO linescout_handoffs
       (token, handoff_type, customer_name, email, context, whatsapp_number, status, paid_at, conversation_id,
        country_id, display_currency_code, settlement_currency_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        token,
        "sourcing",
        customer_name,
        customer_email,
        notes || "Created via admin manual onboarding.",
        whatsapp_number,
        status,
        conversationId,
        countryId || null,
        displayCurrency || null,
        settlementCurrency || null,
      ]
    );

    const handoffId = Number(handoffInsert?.insertId || 0);
    if (!handoffId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Failed to create handoff record" }, { status: 500 });
    }

    // 6) Optional: set total due
    if (total_due !== null) {
      await conn.query(
        `INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_due = VALUES(total_due),
           currency = VALUES(currency)`,
        [handoffId, currency, total_due]
      );
    }

    // 7) Commitment fee is represented via the token (same as standard flow)
    const paymentPurpose = "commitment_fee";
    const paymentNote = `Manual project creation (${paymentSource === "paypal" ? "PayPal" : "Paystack"})`;

    // 8) Link conversation -> handoff
    await conn.query(
      `
      UPDATE linescout_conversations
      SET handoff_id = ?, payment_status = 'paid', chat_mode = 'paid_human'
      WHERE id = ? AND user_id = ?
      LIMIT 1
      `,
      [handoffId, conversationId, userId]
    );

    // 9) Insert default agent welcome message
    const welcomeLines = [
      "Hello,",
      "",
      "Our China-based agents have been notified of your request, and one of them will attend to you shortly.",
      "",
      "Please keep all discussions professional and respectful. Do not exchange personal contact details within the chat. If at any point you need assistance, use the Report or Escalate button and our team will respond promptly.",
      "",
      "Thank you.",
    ];
    await conn.query(
      `
      INSERT INTO linescout_messages (conversation_id, sender_type, sender_id, message_text)
      VALUES (?, 'agent', NULL, ?)
      `,
      [conversationId, welcomeLines.join("\n")]
    );

    await conn.commit();

    // 10) Notify agents + admin (same as standard paid chat flow)
    try {
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
        body: `${customer_name || "A customer"} just opened a paid chat. Tap to claim.`,
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
            `${customer_name || "A customer"} just opened a paid chat.`,
            `Route: ${routeLabel(routeType)}`,
            `Handoff ID: ${handoffId}`,
            "Open the LineScout Agent app to claim this project.",
          ],
          footerNote: "This email was sent because a new paid chat became available for LineScout agents.",
        });
        await sendEmail({
          to: email,
          replyTo: "hello@sureimports.com",
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      }

      const adminMail = buildNoticeEmail({
        subject: "New paid chat started",
        title: "New paid chat started",
        lines: [
          `Route: ${routeLabel(routeType)}`,
          `Handoff ID: ${handoffId}`,
          `Conversation ID: ${conversationId}`,
          `Customer email: ${customer_email}`,
        ],
        footerNote: "This email was sent because a paid chat was started on LineScout.",
      });
      await sendEmail({
        to: "sureimporters@gmail.com",
        replyTo: "hello@sureimports.com",
        subject: adminMail.subject,
        text: adminMail.text,
        html: adminMail.html,
      });
    } catch {
      // ignore notification failures
    }

    // 10) Notify customer via unified status workflow
    const extras: any = {
      email_subject: `LineScout Request Created: ${token}`,
      email_text:
        `Your LineScout machine sourcing request has been created and onboarded.\n\n` +
        `Request ID: ${token}\n` +
        `Status: ${status}\n` +
        (notes ? `\nNotes: ${notes}` : ""),
    };

    extras.update_type = "payment";
    extras.payment_amount = paymentAmount;
    extras.payment_currency = paymentCurrency;
    extras.payment_purpose = paymentPurpose;
    extras.payment_method = paymentSource;
    extras.payment_reference = null;

    extras.email_subject = `Payment Received: ${token}`;
    extras.email_text =
      `Your LineScout request has been created.\n\n` +
      `We have recorded your payment of ${paymentCurrency} ${Number(paymentAmount).toLocaleString()}.\n` +
      `Purpose: ${paymentPurpose}\n` +
      (paymentNote ? `Note: ${paymentNote}\n` : "") +
      `\nRequest ID: ${token}\nStatus: ${status}`;

    notifyStatusEmail({
      event: "handoff.status_changed",
      previous_status: null,
      new_status: status,
      handoff: {
        token,
        customer_name,
        customer_email,
      },
      extras,
    });

    return NextResponse.json({
      ok: true,
      token,
      handoffId,
      conversationId,
      customer_email,
      customer_name,
      status,
      handoff_type: "sourcing",
      total_due,
      currency,
    });
  } catch (e) {
    console.error("manual handoff POST error", e);
    try {
      if (conn) await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: "Failed to create manual handoff" }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
