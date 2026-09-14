import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paypalVerifyPayment } from "@/lib/paypal";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";
import { ensureQuotePaymentFeeColumns } from "@/lib/quote-payment-fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "order_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await ensureQuotePaymentFeeColumns(conn);
    const [rows]: any = await conn.query(
      `SELECT id, quote_id, handoff_id, user_id, purpose, status, amount, currency, processing_fee_amount, COALESCE(base_amount, amount) AS base_amount
       FROM linescout_quote_payments
       WHERE provider_ref = ? AND method = 'paypal'
       LIMIT 1`,
      [orderId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Payment record not found." }, { status: 404 });
    }

    const row = rows[0];
    const capture = await paypalVerifyPayment(orderId, {
      amount: num(row.base_amount) + num(row.processing_fee_amount),
      currency: String(row.currency), customIdPrefix: 'LSQ_' + row.quote_id + '_',
    });
    const currency = String(row.currency);
    const amountValue = num(capture.purchase_units[0].payments.captures[0].amount.value);

    await conn.beginTransaction();
    const [locked]: any = await conn.query('SELECT status FROM linescout_quote_payments WHERE id = ? FOR UPDATE', [row.id]);
    row.status = locked?.[0]?.status;
    if (!row.status) throw new Error('Payment record is missing.');
    const baseAmount = num(row.base_amount, 0) || amountValue;
    if (String(row.status || "") === "paid") {
      const [qRows]: any = await conn.query(
        `SELECT token FROM linescout_quotes WHERE id = ? LIMIT 1`,
        [row.quote_id]
      );
      await conn.commit();
      return NextResponse.json({
        ok: true,
        status: "paid",
        quote_id: Number(row.quote_id || 0),
        handoff_id: Number(row.handoff_id || 0) || null,
        token: String(qRows?.[0]?.token || ""),
      });
    }

    await conn.query(
      `UPDATE linescout_quote_payments
       SET status = 'paid',
           paid_at = NOW()
       WHERE id = ?`,
      [row.id]
    );

    const purpose = String(row.purpose || "");
    const handoffPurpose =
      purpose === "deposit" ? "downpayment" : purpose === "shipping_payment" ? "shipping_payment" : "full_payment";

    if (row.handoff_id) {
      await conn.query(
        `INSERT INTO linescout_handoff_payments
         (handoff_id, amount, currency, purpose, note, paid_at, created_at)
         VALUES (?, ?, ?, ?, 'Quote payment (paypal)', NOW(), NOW())`,
        [row.handoff_id, baseAmount, currency || "GBP", handoffPurpose]
      );
    }

    if (row.handoff_id) {
      await creditAgentCommissionForQuotePayment(conn, {
        quotePaymentId: Number(row.id),
        quoteId: Number(row.quote_id || 0),
        handoffId: Number(row.handoff_id || 0),
        purpose,
        amountNgn: baseAmount,
        currency: currency || "GBP",
      });
    }

    if (row.user_id) {
      const affiliateType =
        purpose === "shipping_payment" ? "shipping_payment" : "project_payment";
      await creditAffiliateEarning(conn, {
        referred_user_id: Number(row.user_id || 0),
        transaction_type: affiliateType,
        source_table: "linescout_quote_payments",
        source_id: Number(row.id),
        base_amount: baseAmount,
        currency: currency || "GBP",
      });
    }

    const [qRows]: any = await conn.query(
      `SELECT token FROM linescout_quotes WHERE id = ? LIMIT 1`,
      [row.quote_id]
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      status: "paid",
      quote_id: Number(row.quote_id || 0),
      handoff_id: Number(row.handoff_id || 0) || null,
      token: String(qRows?.[0]?.token || ""),
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: e?.message || "Verify failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
