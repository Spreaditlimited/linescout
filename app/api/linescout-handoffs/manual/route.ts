import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PoolConnection } from "mysql2/promise";
import { db as sharedDb } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";
import {
  ensureCountryConfig,
  ensureHandoffCountryColumns,
  backfillHandoffDefaults,
  getNigeriaDefaults,
} from "@/lib/country-config";
import { findPaymentAttempt } from "@/lib/payment-attempts";
import { paystackVerifyTransaction } from "@/lib/paystack";
import { paypalGetOrder } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";
type PaymentSource = "paystack" | "paypal" | "bank_transfer" | "cash" | "other";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

function isValidPaymentSource(v: string): v is PaymentSource {
  return ["paystack", "paypal", "bank_transfer", "cash", "other"].includes(v);
}

function handoffTypeForRoute(routeType: RouteType) {
  return routeType === "white_label" ? "white_label" : "sourcing";
}

const N8N_STATUS_NOTIFY_URL =
  process.env.N8N_STATUS_NOTIFY_URL ||
  "https://n8n.sureimports.com/webhook/linescout_status_notify";

function db() {
  return sharedDb.getConnection();
}

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );
    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (String(rows[0].role || "") !== "admin") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }
    return { ok: true as const, userId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
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
 *   currency?: string | null       (required for non-gateway payments)
 *   route_type?: "machine_sourcing" | "white_label" | "simple_sourcing" (optional)
 *   total_due?: number | null      (optional)
 *   payment_source: "paystack" | "paypal" | "bank_transfer" | "cash" | "other" (required)
 *   payment_ref: string (required)
 *   payment_amount?: number | null  (required for non-gateway payments)
 *   payment_note?: string | null
 * }
 */
export async function POST(req: Request) {
  let conn: PoolConnection | null = null;

  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));

    let customer_name = String(body.customer_name || "").trim();
    let customer_email = String(body.customer_email || "").trim();
    const providedUserId = Number(body.user_id || 0);
    const customer_phone = body.customer_phone ? String(body.customer_phone).trim() : null;

    const whatsapp_number = body.whatsapp_number ? String(body.whatsapp_number).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const status = "pending";

    const requestedCurrency = String(body.currency || "").trim().toUpperCase();
    const routeTypeRaw = String(body.route_type || "machine_sourcing").trim();
    if (!isValidRouteType(routeTypeRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }
    const routeType = routeTypeRaw as RouteType;

    const total_due =
      body.total_due === null || body.total_due === undefined ? null : Number(body.total_due);
    const paymentSource = String(body.payment_source || "").trim().toLowerCase();
    const paymentRef = String(body.payment_ref || "").trim();
    const requestedPaymentAmount =
      body.payment_amount === null || body.payment_amount === undefined
        ? null
        : Number(body.payment_amount);
    const paymentNote = body.payment_note ? String(body.payment_note).trim() : null;

    if (!customer_name) {
      return NextResponse.json({ ok: false, error: "customer_name is required" }, { status: 400 });
    }
    if (!customer_email || !customer_email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid customer_email is required" }, { status: 400 });
    }
    if (total_due !== null && (Number.isNaN(total_due) || total_due < 0)) {
      return NextResponse.json({ ok: false, error: "total_due must be >= 0" }, { status: 400 });
    }
    if (!isValidPaymentSource(paymentSource)) {
      return NextResponse.json({ ok: false, error: "Invalid payment_source" }, { status: 400 });
    }
    if (!paymentRef) {
      return NextResponse.json({ ok: false, error: "payment_ref is required" }, { status: 400 });
    }
    if (paymentRef.length > 120) {
      return NextResponse.json({ ok: false, error: "payment_ref is too long" }, { status: 400 });
    }
    const isExternalPayment = !["paystack", "paypal"].includes(paymentSource);
    if (
      isExternalPayment &&
      (requestedPaymentAmount === null ||
        !Number.isFinite(requestedPaymentAmount) ||
        requestedPaymentAmount <= 0)
    ) {
      return NextResponse.json(
        { ok: false, error: "payment_amount must be greater than 0 for external payments" },
        { status: 400 }
      );
    }
    if (isExternalPayment && !requestedCurrency) {
      return NextResponse.json(
        { ok: false, error: "currency is required for external payments" },
        { status: 400 }
      );
    }
    if (requestedCurrency && !/^[A-Z]{3,8}$/.test(requestedCurrency)) {
      return NextResponse.json({ ok: false, error: "Invalid currency code" }, { status: 400 });
    }
    if (paymentSource === "other" && !paymentNote) {
      return NextResponse.json(
        { ok: false, error: "payment_note is required when payment source is other" },
        { status: 400 }
      );
    }

    conn = await db();
    await ensureCountryConfig(conn as any);
    await ensureHandoffCountryColumns(conn as any);
    await backfillHandoffDefaults(conn as any);

    const defaults = await getNigeriaDefaults(conn as any);

    // 1) Resolve user for conversation (required for project creation)
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
      return NextResponse.json(
        { ok: false, error: "A handoff was created for this user recently. Please wait a few minutes and retry." },
        { status: 409 }
      );
    }

    const userCountryId = Number(userRows?.[0]?.country_id || 0) || null;
    const userDisplayCurrency = String(userRows?.[0]?.display_currency_code || "")
      .trim()
      .toUpperCase();
    let paymentAmount = Number(requestedPaymentAmount || 0);
    let paymentCurrency = requestedCurrency || userDisplayCurrency || "NGN";

    // Gateway references must be verified against the provider and belong to the selected user.
    if (paymentSource === "paystack") {
      const verified = await paystackVerifyTransaction(paymentRef);
      if (!verified.ok) {
        return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
      }
      const data: any = verified.data;
      if (String(data?.status || "").toLowerCase() !== "success") {
        return NextResponse.json({ ok: false, error: "Paystack payment is not successful" }, { status: 409 });
      }
      const paidUserId = Number(data?.metadata?.user_id || 0);
      if (!paidUserId || paidUserId !== userId) {
        return NextResponse.json(
          { ok: false, error: "Paystack payment does not belong to the selected customer" },
          { status: 400 }
        );
      }
      const paidPurpose = String(data?.metadata?.purpose || "sourcing").trim();
      if (paidPurpose !== "sourcing") {
        return NextResponse.json(
          { ok: false, error: "Paystack payment is not for a sourcing project" },
          { status: 400 }
        );
      }
      const paidRoute = String(data?.metadata?.route_type || routeType).trim();
      if (paidRoute !== routeType) {
        return NextResponse.json(
          { ok: false, error: `Paystack payment belongs to the ${paidRoute} route` },
          { status: 400 }
        );
      }
      paymentAmount = Number(data?.amount || 0) / 100;
      paymentCurrency = String(data?.currency || "NGN").trim().toUpperCase() || "NGN";
    } else if (paymentSource === "paypal") {
      const attempt = await findPaymentAttempt(conn as any, "paypal", paymentRef);
      if (!attempt || Number(attempt.user_id || 0) !== userId) {
        return NextResponse.json(
          { ok: false, error: "No PayPal payment attempt belongs to the selected customer" },
          { status: 400 }
        );
      }
      if (String(attempt.purpose || "").trim() !== "sourcing") {
        return NextResponse.json(
          { ok: false, error: "PayPal payment is not for a sourcing project" },
          { status: 400 }
        );
      }
      if (String(attempt.route_type || routeType).trim() !== routeType) {
        return NextResponse.json(
          { ok: false, error: `PayPal payment belongs to the ${attempt.route_type} route` },
          { status: 400 }
        );
      }
      let order: any;
      try {
        order = await paypalGetOrder(paymentRef);
      } catch (error: any) {
        return NextResponse.json(
          { ok: false, error: String(error?.message || "PayPal verification failed") },
          { status: 400 }
        );
      }
      if (String(order?.status || "").toUpperCase() !== "COMPLETED") {
        return NextResponse.json({ ok: false, error: "PayPal payment is not completed" }, { status: 409 });
      }
      const unit = Array.isArray(order?.purchase_units) ? order.purchase_units[0] : null;
      const capture = unit?.payments?.captures?.[0];
      paymentAmount = Number(capture?.amount?.value || unit?.amount?.value || 0);
      paymentCurrency = String(
        capture?.amount?.currency_code || unit?.amount?.currency_code || attempt.currency || ""
      )
        .trim()
        .toUpperCase();
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !paymentCurrency) {
      return NextResponse.json({ ok: false, error: "Verified payment amount is invalid" }, { status: 400 });
    }

    const finalCurrency = paymentCurrency;
    const displayCurrency = finalCurrency || defaults.display_currency_code;
    const settlementCurrency = finalCurrency || defaults.settlement_currency_code;
    const countryId = userCountryId || defaults.country_id;

    // Ensure every provider/manual reference is globally single-use, including older PayPal metadata.
    const [refRows]: any = await conn.query(
      `SELECT id
       FROM linescout_tokens
       WHERE paystack_ref = ?
          OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.paypal.order_id')) = ?
          OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.manual.reference')) = ?
       LIMIT 1`,
      [paymentRef, paymentRef, paymentRef]
    );
    if (refRows?.length) {
      return NextResponse.json(
        { ok: false, error: "This payment reference has already been used." },
        { status: 409 }
      );
    }

    await conn.beginTransaction();

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
            paymentRef,
            "valid",
            JSON.stringify({
              source: "manual_admin",
              created_via: "admin_settings",
              created_by_admin_user_id: auth.userId,
              created_at: now.toISOString(),
              note: "Admin-recorded payment and manual project creation",
              payment_source: paymentSource,
              paystack: paymentSource === "paystack" ? { reference: paymentRef } : undefined,
              paypal: paymentSource === "paypal" ? { order_id: paymentRef } : undefined,
              manual: isExternalPayment
                ? { method: paymentSource, reference: paymentRef, note: paymentNote }
                : undefined,
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

    // 5) Create handoff record using the same type mapping as the standard payment flow.
    const [handoffInsert]: any = await conn.query(
      `INSERT INTO linescout_handoffs
       (token, handoff_type, customer_name, email, context, whatsapp_number, status, paid_at, conversation_id,
        country_id, display_currency_code, settlement_currency_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        token,
        handoffTypeForRoute(routeType),
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
        [handoffId, paymentCurrency, total_due]
      );
    }

    // 7) Commitment fee is represented via the token (same as standard flow)
    const paymentPurpose = "commitment_fee";
    const paymentLabel =
      paymentSource === "bank_transfer"
        ? "Bank transfer"
        : paymentSource === "cash"
          ? "Cash"
          : paymentSource === "other"
            ? "Other"
            : paymentSource === "paypal"
              ? "PayPal"
              : "Paystack";
    const paymentHistoryNote = paymentNote || `Admin-recorded project payment (${paymentLabel})`;

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
    extras.payment_reference = paymentRef;

    extras.email_subject = `Payment Received: ${token}`;
    extras.email_text =
      `Your LineScout request has been created.\n\n` +
      `We have recorded your payment of ${paymentCurrency} ${Number(paymentAmount).toLocaleString()}.\n` +
      `Purpose: ${paymentPurpose}\n` +
      (paymentHistoryNote ? `Note: ${paymentHistoryNote}\n` : "") +
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
      handoff_type: handoffTypeForRoute(routeType),
      payment_source: paymentSource,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      total_due,
      currency: paymentCurrency,
    });
  } catch (e) {
    console.error("manual handoff POST error", e);
    try {
      if (conn) await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: "Failed to create manual handoff" }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
