import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 *   customer_name: string (required)
 *   customer_email: string (required)
 *   customer_phone?: string | null
 *   whatsapp_number?: string | null
 *   notes?: string | null
 *   status?: string | null         (optional, default "pending")
 *   currency?: string | null       (optional, default "NGN")
 *   total_due?: number | null      (optional)
 *   initial_payment?: {
 *     amount: number
 *     purpose: "downpayment" | "full_payment" | "shipping_payment" | "additional_payment"
 *     note?: string | null
 *   } | null
 * }
 */
export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json().catch(() => ({}));

    const customer_name = String(body.customer_name || "").trim();
    const customer_email = String(body.customer_email || "").trim();
    const customer_phone = body.customer_phone ? String(body.customer_phone).trim() : null;

    const whatsapp_number = body.whatsapp_number ? String(body.whatsapp_number).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // Handoff status is separate from token status. Default is pending.
    const status = String(body.status || "pending").trim() || "pending";

    const currency = String(body.currency || "NGN").trim() || "NGN";

    const total_due =
      body.total_due === null || body.total_due === undefined ? null : Number(body.total_due);

    const initial_payment = body.initial_payment || null;

    if (!customer_name) {
      return NextResponse.json({ ok: false, error: "customer_name is required" }, { status: 400 });
    }
    if (!customer_email || !customer_email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid customer_email is required" }, { status: 400 });
    }
    if (total_due !== null && (Number.isNaN(total_due) || total_due < 0)) {
      return NextResponse.json({ ok: false, error: "total_due must be >= 0" }, { status: 400 });
    }

    if (initial_payment) {
      const amt = Number(initial_payment.amount);
      const purpose = String(initial_payment.purpose || "").trim();
      const allowed = ["downpayment", "full_payment", "shipping_payment", "additional_payment"];

      if (!amt || Number.isNaN(amt) || amt <= 0) {
        return NextResponse.json(
          { ok: false, error: "initial_payment.amount must be > 0" },
          { status: 400 }
        );
      }
      if (!allowed.includes(purpose)) {
        return NextResponse.json(
          { ok: false, error: "initial_payment.purpose invalid" },
          { status: 400 }
        );
      }
    }

    conn = await db();
    await conn.beginTransaction();

    // 1) Create token record matching production logic
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
           (token, type, email, status, metadata, expires_at, customer_name, customer_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t,
            "sourcing",
            customer_email,
            "valid",
            JSON.stringify({
              source: "manual_admin",
              created_via: "admin_settings",
              created_at: now.toISOString(),
              note: "Bank transfer/manual onboarding",
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

    // 2) Create handoff record (handoff_type MUST be "sourcing")
    const [handoffInsert]: any = await conn.query(
      `INSERT INTO linescout_handoffs
       (token, handoff_type, customer_name, email, context, whatsapp_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [token, "sourcing", customer_name, customer_email, notes, whatsapp_number, status]
    );

    const handoffId = Number(handoffInsert?.insertId || 0);
    if (!handoffId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Failed to create handoff record" }, { status: 500 });
    }

    // 3) Optional: set total due
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

    // 4) Optional: initial payment
    let paymentAmount: number | null = null;
    let paymentPurpose: string | null = null;
    let paymentNote: string | null = null;

    if (initial_payment) {
      paymentAmount = Number(initial_payment.amount);
      paymentPurpose = String(initial_payment.purpose).trim();
      paymentNote = initial_payment.note ? String(initial_payment.note).trim() : null;

      await conn.query(
        `INSERT INTO linescout_handoff_payments
         (handoff_id, amount, currency, purpose, note, paid_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [handoffId, paymentAmount, currency, paymentPurpose, paymentNote, now]
      );
    }

    await conn.commit();

    // 5) Notify customer via unified status workflow
    const extras: any = {
      email_subject: `LineScout Request Created: ${token}`,
      email_text:
        `Your LineScout machine sourcing request has been created and onboarded.\n\n` +
        `Request ID: ${token}\n` +
        `Status: ${status}\n` +
        (notes ? `\nNotes: ${notes}` : ""),
    };

    if (paymentAmount !== null && paymentPurpose) {
      extras.update_type = "payment";
      extras.payment_amount = paymentAmount;
      extras.payment_currency = currency;
      extras.payment_purpose = paymentPurpose;
      extras.payment_method = "manual_record";
      extras.payment_reference = null;

      extras.email_subject = `Payment Received: ${token}`;
      extras.email_text =
        `Your LineScout request has been created.\n\n` +
        `We have recorded your payment of ${currency} ${Number(paymentAmount).toLocaleString()}.\n` +
        `Purpose: ${paymentPurpose}\n` +
        (paymentNote ? `Note: ${paymentNote}\n` : "") +
        `\nRequest ID: ${token}\nStatus: ${status}`;
    }

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