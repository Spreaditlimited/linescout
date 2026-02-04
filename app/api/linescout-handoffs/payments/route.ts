import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const N8N_BASE_URL = process.env.N8N_BASE_URL;

// Status email webhook (fixed URL you provided)
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

function toOptionalPositiveInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (n <= 0) return null;
  return Math.floor(n);
}

function pickItems(raw: any) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw.items;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Fire-and-forget: never block saving payments (admin notify)
async function notifyN8n(event: string, payload: any) {
  if (!N8N_BASE_URL) return;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);

    await fetch(`${N8N_BASE_URL}/webhook/linescout_admin_notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(t);
  } catch {
    // ignore
  }
}

// Fire-and-forget: status email workflow notify (customer)
async function notifyStatusEmail(payload: any) {
  if (!N8N_STATUS_NOTIFY_URL) return;

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
 * GET /api/linescout-handoffs/payments?handoffId=123
 * Returns:
 * - total due
 * - total paid
 * - balance
 * - payment history
 */
export async function GET(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const url = new URL(req.url);
    const handoffId = Number(url.searchParams.get("handoffId"));

    if (!handoffId) {
      return NextResponse.json(
        { ok: false, error: "handoffId is required" },
        { status: 400 }
      );
    }

    conn = await db();

    const [finRows]: any = await conn.query(
      `SELECT total_due, currency
       FROM linescout_handoff_financials
       WHERE handoff_id = ?
       LIMIT 1`,
      [handoffId]
    );

    const [payRows]: any = await conn.query(
      `SELECT
         id,
         amount,
         currency,
         purpose,
         note,
         paid_at,
         created_at
       FROM linescout_handoff_payments
       WHERE handoff_id = ?
       ORDER BY paid_at DESC, id DESC`,
      [handoffId]
    );

    const [sumRows]: any = await conn.query(
      `SELECT COALESCE(SUM(amount),0) AS total_paid
       FROM linescout_handoff_payments
       WHERE handoff_id = ?`,
      [handoffId]
    );

    const [quoteRows]: any = await conn.query(
      `SELECT
         q.id,
         q.token,
         q.shipping_type_id,
         q.total_product_ngn,
         q.total_shipping_ngn,
         q.total_markup_ngn,
         q.commitment_due_ngn,
         q.items_json,
         st.name AS shipping_type_name
       FROM linescout_quotes q
       LEFT JOIN linescout_shipping_types st ON st.id = q.shipping_type_id
       WHERE q.handoff_id = ?
       ORDER BY
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM linescout_quote_payments p
             WHERE p.quote_id = q.id
           ) THEN 0
           ELSE 1
         END ASC,
         q.id DESC
       LIMIT 1`,
      [handoffId]
    );

    const latestQuote = quoteRows?.[0] || null;
    let quoteSummary: any = null;
    if (latestQuote) {
      const productDue = Math.max(
        0,
        Math.round(
          Number(latestQuote.total_product_ngn || 0) +
            Number(latestQuote.total_markup_ngn || 0) -
            Number(latestQuote.commitment_due_ngn || 0)
        )
      );
      const shippingDue = Math.max(0, Math.round(Number(latestQuote.total_shipping_ngn || 0)));

      const [quotePaidRows]: any = await conn.query(
        `SELECT
           COALESCE(SUM(CASE WHEN purpose IN ('deposit','product_balance','full_product_payment') AND status = 'paid' THEN amount ELSE 0 END), 0) AS product_paid,
           COALESCE(SUM(CASE WHEN purpose = 'shipping_payment' AND status = 'paid' THEN amount ELSE 0 END), 0) AS shipping_paid
         FROM linescout_quote_payments
         WHERE quote_id = ?`,
        [latestQuote.id]
      );
      const productPaid = Number(quotePaidRows?.[0]?.product_paid || 0);
      const shippingPaid = Number(quotePaidRows?.[0]?.shipping_paid || 0);

      const items = pickItems(latestQuote.items_json);
      const firstItem = items?.[0] || null;
      const totalQuantity = items.reduce((sum: number, item: any) => {
        const q = Number(item?.quantity || 0);
        return Number.isFinite(q) ? sum + q : sum;
      }, 0);

      quoteSummary = {
        quote_id: Number(latestQuote.id),
        quote_token: String(latestQuote.token || ""),
        product_name: firstItem?.product_name ? String(firstItem.product_name) : null,
        total_quantity: totalQuantity,
        shipping_type: latestQuote.shipping_type_name ? String(latestQuote.shipping_type_name) : null,
        product_due: productDue,
        product_paid: productPaid,
        product_balance: Math.max(0, productDue - productPaid),
        shipping_due: shippingDue,
        shipping_paid: shippingPaid,
        shipping_balance: Math.max(0, shippingDue - shippingPaid),
      };
    }

    const totalPaid = Number(sumRows?.[0]?.total_paid || 0);
    const totalDue = Number(finRows?.[0]?.total_due || 0);
    const currency = finRows?.[0]?.currency || "NGN";

    return NextResponse.json({
      ok: true,
      financials: {
        currency,
        total_due: totalDue,
        total_paid: totalPaid,
        balance: totalDue - totalPaid,
      },
      quote_summary: quoteSummary,
      payments: payRows || [],
    });
  } catch (e) {
    console.error("handoff payments GET error", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load payments" },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * POST /api/linescout-handoffs/payments
 * Body:
 * {
 *   handoffId,
 *   amount,
 *   purpose: "downpayment" | "full_payment" | "shipping_payment" | "additional_payment",
 *   totalDue?: number,   // optional, set once or adjust
 *   currency?: "NGN",
 *   note?: string,
 *   paidAt?: ISO string,
 *   bank_id?: number | null   // NEW: optional bank selection (stored on linescout_handoffs.bank_id)
 * }
 */
export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

  // capture for notification (after commit)
  let notifyPayload: any = null;
  let statusEmailPayload: any = null;

  function toOptionalPositiveInt(v: any): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || Number.isNaN(n)) return null;
    if (n <= 0) return null;
    return Math.floor(n);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      handoffId,
      amount,
      purpose,
      totalDue,
      currency = "NGN",
      note = "",
      paidAt,
      bank_id, // NEW
    } = body;

    const hid = Number(handoffId);
    const amt = Number(amount);
    const bankId = toOptionalPositiveInt(bank_id);

    if (!hid || !amt || amt <= 0) {
      return NextResponse.json(
        { ok: false, error: "handoffId and valid amount are required" },
        { status: 400 }
      );
    }

    const allowed = [
      "downpayment",
      "full_payment",
      "shipping_payment",
      "additional_payment",
    ];
    if (!allowed.includes(purpose)) {
      return NextResponse.json({ ok: false, error: "Invalid payment purpose" }, { status: 400 });
    }

    // Enforce bank selection for recorded payments
    if (!bankId) {
      return NextResponse.json({ ok: false, error: "bank_id is required" }, { status: 400 });
    }

    conn = await db();
    await conn.beginTransaction();

    // Validate bank exists + active
    const [bankRows]: any = await conn.query(
      `SELECT id, name, is_active
       FROM linescout_banks
       WHERE id = ?
       LIMIT 1`,
      [bankId]
    );

    if (!bankRows || bankRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Invalid bank_id" }, { status: 400 });
    }
    if (!bankRows[0].is_active) {
      await conn.rollback();
      return NextResponse.json(
        { ok: false, error: "Selected bank is inactive" },
        { status: 400 }
      );
    }

    // Persist the selected bank on the handoff (source of truth for the project)
    await conn.query(`UPDATE linescout_handoffs SET bank_id = ? WHERE id = ?`, [bankId, hid]);

    // set or update total due (only when provided)
    if (totalDue !== undefined) {
      const td = Number(totalDue);
      if (Number.isNaN(td) || td < 0) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "totalDue must be >= 0" }, { status: 400 });
      }

      await conn.query(
        `INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_due = VALUES(total_due),
           currency = VALUES(currency)`,
        [hid, currency, td]
      );
    }

    const paid_at = paidAt ? new Date(paidAt) : new Date();
    if (Number.isNaN(paid_at.getTime())) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Invalid paidAt" }, { status: 400 });
    }

    // Insert payment (unchanged table)
    await conn.query(
      `INSERT INTO linescout_handoff_payments
       (handoff_id, amount, currency, purpose, note, paid_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hid, amt, currency, purpose, note, paid_at]
    );

    // Get handoff details for notifications
    const [handoffRows]: any = await conn.query(
      `SELECT id, token, customer_name, email, whatsapp_number, status, bank_id
       FROM linescout_handoffs
       WHERE id = ?
       LIMIT 1`,
      [hid]
    );
    const h = handoffRows?.[0] || null;

    // Compute financial summary
    const [finRows]: any = await conn.query(
      `SELECT total_due, currency
       FROM linescout_handoff_financials
       WHERE handoff_id = ?
       LIMIT 1`,
      [hid]
    );

    const [sumRows]: any = await conn.query(
      `SELECT COALESCE(SUM(amount),0) AS total_paid
       FROM linescout_handoff_payments
       WHERE handoff_id = ?`,
      [hid]
    );

    const totalPaid = Number(sumRows?.[0]?.total_paid || 0);
    const totalDueDb = Number(finRows?.[0]?.total_due || 0);
    const currencyDb = finRows?.[0]?.currency || currency || "NGN";
    const balance = totalDueDb - totalPaid;

    // Admin notification payload
    notifyPayload = {
      handoff: h,
      payment: {
        amount: amt,
        currency: currencyDb,
        purpose,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        paid_at: paid_at.toISOString(),
        bank_id: bankId,
        bank_name: String(bankRows[0].name || ""),
      },
    };

    // Customer status email payload (payment as an update)
    statusEmailPayload = {
      event: "handoff.status_changed",
      previous_status: h?.status || null,
      new_status: h?.status || null,
      handoff: {
        token: h?.token || null,
        customer_name: h?.customer_name || null,
        customer_email: h?.email || null,
      },
      extras: {
        update_type: "payment",
        payment_amount: amt,
        payment_currency: currencyDb,
        payment_purpose: purpose,
        payment_method: "manual_record",
        payment_reference: null,

        bank_id: bankId,
        bank_name: String(bankRows[0].name || ""),

        total_paid: totalPaid,
        total_due: totalDueDb,
        balance,

        email_subject: h?.token ? `Payment Received: ${h.token}` : "Payment Received",
        email_text:
          `We have recorded your payment of ${currencyDb} ${Number(amt).toLocaleString()}.\n\n` +
          (totalDueDb > 0
            ? `Total Due: ${currencyDb} ${Number(totalDueDb).toLocaleString()}\nTotal Paid: ${currencyDb} ${Number(totalPaid).toLocaleString()}\nBalance: ${currencyDb} ${Number(balance).toLocaleString()}`
            : ""),
      },
    };

    await conn.commit();

    // Fire-and-forget AFTER commit
    notifyN8n("payment_recorded", notifyPayload);
    notifyStatusEmail(statusEmailPayload);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("handoff payments POST error", e);
    try {
      if (conn) await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: "Failed to save payment" }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
