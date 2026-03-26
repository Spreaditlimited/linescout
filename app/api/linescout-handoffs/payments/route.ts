import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { resolveActualCommitmentPayment } from "@/lib/commitment-fee";

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

function normalizeCurrency(code: any, fallback = "NGN") {
  const c = String(code || "").trim().toUpperCase();
  return c || fallback;
}

function buildFxLookup(rows: any[]) {
  const map = new Map<string, number>();
  for (const row of rows || []) {
    const base = normalizeCurrency(row?.base_currency_code, "");
    const quote = normalizeCurrency(row?.quote_currency_code, "");
    const rate = Number(row?.rate || 0);
    if (!base || !quote || !Number.isFinite(rate) || rate <= 0) continue;
    const key = `${base}->${quote}`;
    if (!map.has(key)) {
      map.set(key, rate);
    }
  }
  return map;
}

function resolveFxRate(lookup: Map<string, number>, from: string, to: string) {
  const base = normalizeCurrency(from, "NGN");
  const quote = normalizeCurrency(to, "NGN");
  if (base === quote) return 1;

  const direct = lookup.get(`${base}->${quote}`);
  if (direct && direct > 0) return direct;

  const inverse = lookup.get(`${quote}->${base}`);
  if (inverse && inverse > 0) return 1 / inverse;

  const viaNgnA = lookup.get(`${base}->NGN`) || 0;
  const viaNgnB = lookup.get(`NGN->${quote}`) || 0;
  if (viaNgnA > 0 && viaNgnB > 0) return viaNgnA * viaNgnB;

  const viaNgnInvA = lookup.get(`NGN->${base}`) || 0;
  const viaNgnInvB = lookup.get(`${quote}->NGN`) || 0;
  if (viaNgnInvA > 0 && viaNgnInvB > 0) return (1 / viaNgnInvA) * (1 / viaNgnInvB);

  return 0;
}

function convertToDisplay(
  amount: number,
  fromCurrency: string,
  displayCurrency: string,
  lookup: Map<string, number>
) {
  const from = normalizeCurrency(fromCurrency, "NGN");
  const to = normalizeCurrency(displayCurrency, "NGN");
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) {
    return { amount: null as number | null, rate: 0, status: "invalid_amount" as const };
  }
  if (from === to) {
    return { amount: Number(value.toFixed(2)), rate: 1, status: "ok" as const };
  }
  const rate = resolveFxRate(lookup, from, to);
  if (!rate || rate <= 0) {
    return { amount: null as number | null, rate: 0, status: "missing_rate" as const };
  }
  return { amount: Number((value * rate).toFixed(2)), rate, status: "ok" as const };
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

    let commitmentPayment: any | null = null;
    const [handoffRows]: any = await conn.query(
      `SELECT token, display_currency_code
       FROM linescout_handoffs
       WHERE id = ?
       LIMIT 1`,
      [handoffId]
    );
    const handoffToken = String(handoffRows?.[0]?.token || "").trim();
    const handoffDisplayCurrency = String(handoffRows?.[0]?.display_currency_code || "").trim();
    if (handoffToken) {
      const [commitRows]: any = await conn.query(
        `SELECT id, amount, currency, created_at, paystack_ref, metadata
         FROM linescout_tokens
         WHERE token = ?
           AND status = 'valid'
           AND type IN ('sourcing','business_plan')
         ORDER BY id ASC
         LIMIT 1`,
        [handoffToken]
      );
      const cp = commitRows?.[0];
      if (cp?.id) {
        let meta: any = null;
        try {
          meta = cp.metadata ? JSON.parse(String(cp.metadata)) : null;
        } catch {
          meta = null;
        }
        const provider =
          String(meta?.payment_source || meta?.provider || "").trim() ||
          (cp.paystack_ref ? "paystack" : "");
        const reference =
          String(cp.paystack_ref || "").trim() ||
          String(meta?.paystack?.reference || meta?.paystack_ref || meta?.reference || "").trim() ||
          String(meta?.paypal?.order_id || meta?.paypal?.orderId || meta?.paypal_order_id || "").trim();
        commitmentPayment = {
          id: Number(cp.id),
          purpose: "commitment_fee",
          amount: Number(cp.amount || 0),
          currency: String(cp.currency || "NGN"),
          created_at: cp.created_at || null,
          provider: provider || null,
          reference: reference || null,
        };
      }
    }

    const [quoteRows]: any = await conn.query(
      `SELECT
         q.id,
         q.token,
         q.shipping_type_id,
         q.total_product_ngn,
         q.total_shipping_ngn,
         q.total_markup_ngn,
         q.commitment_due_ngn,
         q.total_addons_ngn,
         q.total_vat_ngn,
         q.total_product_rmb,
         q.total_shipping_usd,
         q.display_currency_code,
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
    const displayCurrencyCode =
      String(latestQuote?.display_currency_code || handoffDisplayCurrency || "NGN").trim().toUpperCase() || "NGN";

    const allCurrencies = new Set<string>(["NGN", "RMB", "USD", displayCurrencyCode]);
    for (const p of payRows || []) {
      allCurrencies.add(normalizeCurrency(p?.currency, "NGN"));
    }
    if (commitmentPayment) {
      allCurrencies.add(normalizeCurrency(commitmentPayment.currency, "NGN"));
    }
    const currencyList = Array.from(allCurrencies.values()).filter(Boolean);
    const placeholders = currencyList.map(() => "?").join(", ");
    const [allFxRows]: any = await conn.query(
      `SELECT base_currency_code, quote_currency_code, rate
       FROM linescout_fx_rates
       WHERE base_currency_code IN (${placeholders})
          OR quote_currency_code IN (${placeholders})
       ORDER BY effective_at DESC, id DESC`,
      [...currencyList, ...currencyList]
    );
    const fxLookup = buildFxLookup(allFxRows || []);

    let ngnToDisplay = 1;
    let rmbToDisplay = 0;
    let usdToDisplay = 0;
    let rmbToNgn = 0;
    if (displayCurrencyCode !== "NGN") {
      ngnToDisplay = resolveFxRate(fxLookup, "NGN", displayCurrencyCode);
      rmbToDisplay = resolveFxRate(fxLookup, "RMB", displayCurrencyCode);
      usdToDisplay = resolveFxRate(fxLookup, "USD", displayCurrencyCode);
      rmbToNgn = resolveFxRate(fxLookup, "RMB", "NGN");
    } else {
      ngnToDisplay = 1;
      rmbToDisplay = 0;
      usdToDisplay = 0;
      rmbToNgn = resolveFxRate(fxLookup, "RMB", "NGN");
    }
    let quoteSummary: any = null;
    if (latestQuote) {
      const actualCommitment = await resolveActualCommitmentPayment(
        conn,
        handoffId,
        Number(latestQuote.commitment_due_ngn || 0)
      );
      const commitmentDueNgn = Number(actualCommitment.amountNgn || 0);
      const commitmentDisplay =
        normalizeCurrency(actualCommitment.currency, "NGN") === displayCurrencyCode
          ? Number(actualCommitment.amount || 0)
          : commitmentDueNgn * ngnToDisplay;
      const addonsNgn = Number(latestQuote.total_addons_ngn || 0);
      const vatNgn = Number(latestQuote.total_vat_ngn || 0);
      const productDue = Math.max(
        0,
        Math.round(
          Number(latestQuote.total_product_ngn || 0) +
            Number(latestQuote.total_markup_ngn || 0) -
            commitmentDueNgn
        )
      );
      const shippingDue = Math.max(0, Math.round(Number(latestQuote.total_shipping_ngn || 0)));

      const [quotePaymentRows]: any = await conn.query(
        `SELECT purpose, status, COALESCE(base_amount, amount) AS paid_amount, currency
         FROM linescout_quote_payments
         WHERE quote_id = ?
           AND status = 'paid'`,
        [latestQuote.id]
      );
      let productPaid = 0;
      let shippingPaid = 0;
      let productPaidDisplay = 0;
      let shippingPaidDisplay = 0;
      for (const row of quotePaymentRows || []) {
        const amount = Number(row?.paid_amount || 0);
        const cur = normalizeCurrency(row?.currency, "NGN");
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const toNgn = resolveFxRate(fxLookup, cur, "NGN");
        const asNgn = toNgn > 0 ? amount * toNgn : 0;
        const asDisplay = convertToDisplay(amount, cur, displayCurrencyCode, fxLookup);
        const disp = asDisplay.amount != null ? asDisplay.amount : 0;

        if (String(row?.purpose || "") === "shipping_payment") {
          shippingPaid += asNgn;
          shippingPaidDisplay += disp;
        } else {
          productPaid += asNgn;
          productPaidDisplay += disp;
        }
      }

      const items = pickItems(latestQuote.items_json);
      const firstItem = items?.[0] || null;
      const totalQuantity = items.reduce((sum: number, item: any) => {
        const q = Number(item?.quantity || 0);
        return Number.isFinite(q) ? sum + q : sum;
      }, 0);

      let productTotalDisplay = 0;
      let shippingDisplay = 0;
      let productDueDisplay = 0;
      let shippingDueDisplay = 0;
      if (displayCurrencyCode === "NGN") {
        productTotalDisplay =
          Number(latestQuote.total_product_ngn || 0) +
          Number(latestQuote.total_markup_ngn || 0) +
          addonsNgn +
          vatNgn;
        shippingDisplay = Number(latestQuote.total_shipping_ngn || 0);
        productDueDisplay = Math.max(0, productTotalDisplay - commitmentDisplay);
        shippingDueDisplay = shippingDue;
      } else if (rmbToDisplay > 0 && usdToDisplay > 0 && rmbToNgn > 0) {
        const baseProductDisplay = Number(latestQuote.total_product_rmb || 0) * rmbToDisplay;
        const markupDisplay = Number(latestQuote.total_markup_ngn || 0) * ngnToDisplay;
        const addonsVatDisplay = (addonsNgn + vatNgn) * ngnToDisplay;
        productTotalDisplay = baseProductDisplay + markupDisplay + addonsVatDisplay;
        shippingDisplay = Number(latestQuote.total_shipping_usd || 0) * usdToDisplay;
        productDueDisplay = Math.max(0, productTotalDisplay - commitmentDisplay);
        shippingDueDisplay = shippingDisplay;
      }

      productPaid = Number(productPaid.toFixed(2));
      shippingPaid = Number(shippingPaid.toFixed(2));
      productPaidDisplay = Number(productPaidDisplay.toFixed(2));
      shippingPaidDisplay = Number(shippingPaidDisplay.toFixed(2));

      quoteSummary = {
        quote_id: Number(latestQuote.id),
        quote_token: String(latestQuote.token || ""),
        product_name: firstItem?.product_name ? String(firstItem.product_name) : null,
        total_quantity: totalQuantity,
        shipping_type: latestQuote.shipping_type_name ? String(latestQuote.shipping_type_name) : null,
        product_due: productDue,
        product_total_display: productTotalDisplay,
        commitment_discount_display: commitmentDisplay,
        product_paid: productPaid,
        product_balance: Math.max(0, productDue - productPaid),
        shipping_due: shippingDue,
        shipping_paid: shippingPaid,
        shipping_balance: Math.max(0, shippingDue - shippingPaid),
        display_currency_code: displayCurrencyCode,
        product_due_display: productDueDisplay,
        shipping_due_display: shippingDueDisplay,
        product_paid_display: productPaidDisplay,
        shipping_paid_display: shippingPaidDisplay,
        product_balance_display: Math.max(0, productDueDisplay - productPaidDisplay),
        shipping_balance_display: Math.max(0, shippingDueDisplay - shippingPaidDisplay),
      };
    }

    const totalPaid = Number(sumRows?.[0]?.total_paid || 0);
    const totalDue = Number(finRows?.[0]?.total_due || 0);
    const currency = normalizeCurrency(finRows?.[0]?.currency, "NGN");

    const dueDisplayConv = convertToDisplay(totalDue, currency, displayCurrencyCode, fxLookup);
    const displayTotalDue =
      dueDisplayConv.amount != null
        ? dueDisplayConv.amount
        : displayCurrencyCode === "NGN"
        ? totalDue
        : totalDue * (ngnToDisplay || 0);

    let displayTotalPaid = 0;
    const paymentsDisplay = (payRows || []).map((p: any) => {
      const originalCurrency = normalizeCurrency(p?.currency, "NGN");
      const originalAmount = Number(p?.amount || 0);
      const converted = convertToDisplay(originalAmount, originalCurrency, displayCurrencyCode, fxLookup);
      if (converted.amount != null) displayTotalPaid += converted.amount;
      return {
        ...p,
        amount: originalAmount,
        currency: originalCurrency,
        display_currency_code: displayCurrencyCode,
        amount_display: converted.amount,
        fx_rate_used: converted.rate > 0 ? converted.rate : null,
        conversion_status: converted.status,
      };
    });

    if (commitmentPayment) {
      const converted = convertToDisplay(
        Number(commitmentPayment.amount || 0),
        normalizeCurrency(commitmentPayment.currency, "NGN"),
        displayCurrencyCode,
        fxLookup
      );
      commitmentPayment = {
        ...commitmentPayment,
        display_currency_code: displayCurrencyCode,
        amount_display: converted.amount,
        fx_rate_used: converted.rate > 0 ? converted.rate : null,
        conversion_status: converted.status,
      };
    }

    let finalDisplayTotalDue = displayTotalDue;
    let finalDisplayTotalPaid = displayTotalPaid;
    let finalDisplayBalance = finalDisplayTotalDue - finalDisplayTotalPaid;
    let displaySource: "handoff_financials" | "quote_summary" = "handoff_financials";

    if (quoteSummary) {
      const commitmentPaidDisplay = Number(commitmentPayment?.amount_display ?? 0);
      const quoteDueDisplay =
        Number(quoteSummary.product_total_display || 0) + Number(quoteSummary.shipping_due_display || 0);
      const quotePaidDisplay =
        Number(quoteSummary.product_paid_display || 0) +
        Number(quoteSummary.shipping_paid_display || 0) +
        commitmentPaidDisplay;
      if (
        Number.isFinite(quoteDueDisplay) &&
        Number.isFinite(quotePaidDisplay) &&
        quoteDueDisplay >= 0 &&
        quotePaidDisplay >= 0
      ) {
        finalDisplayTotalDue = Number(quoteDueDisplay.toFixed(2));
        finalDisplayTotalPaid = Number(quotePaidDisplay.toFixed(2));
        finalDisplayBalance = Number(Math.max(0, finalDisplayTotalDue - finalDisplayTotalPaid).toFixed(2));
        displaySource = "quote_summary";
      }
    }

    return NextResponse.json({
      ok: true,
      financials: {
        currency,
        total_due: totalDue,
        total_paid: totalPaid,
        balance: totalDue - totalPaid,
        display_currency_code: displayCurrencyCode,
        display_total_due: finalDisplayTotalDue,
        display_total_paid: finalDisplayTotalPaid,
        display_balance: finalDisplayBalance,
        display_source: displaySource,
      },
      quote_summary: quoteSummary,
      commitment_payment: commitmentPayment,
      payments: paymentsDisplay,
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
