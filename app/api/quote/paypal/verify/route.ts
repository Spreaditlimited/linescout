import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paypalCaptureOrder } from "@/lib/paypal";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";

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

  const capture = await paypalCaptureOrder(orderId);
  const status = String(capture?.status || "").toUpperCase();
  if (status !== "COMPLETED") {
    return NextResponse.json({ ok: false, error: "Payment not completed yet." }, { status: 400 });
  }

  const purchaseUnit = Array.isArray(capture?.purchase_units) ? capture.purchase_units[0] : null;
  const paymentCapture = purchaseUnit?.payments?.captures?.[0];
  const amountValue = num(paymentCapture?.amount?.value, 0);
  const currency = String(paymentCapture?.amount?.currency_code || "GBP");

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, quote_id, handoff_id, user_id, purpose, status
       FROM linescout_quote_payments
       WHERE provider_ref = ?
       LIMIT 1`,
      [orderId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Payment record not found." }, { status: 404 });
    }

    const row = rows[0];
    if (String(row.status || "") === "paid") {
      const [qRows]: any = await conn.query(
        `SELECT token FROM linescout_quotes WHERE id = ? LIMIT 1`,
        [row.quote_id]
      );
      return NextResponse.json({
        ok: true,
        status: "paid",
        quote_id: Number(row.quote_id || 0),
        handoff_id: Number(row.handoff_id || 0) || null,
        token: String(qRows?.[0]?.token || ""),
      });
    }

    await conn.beginTransaction();
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
        [row.handoff_id, amountValue, currency || "GBP", handoffPurpose]
      );
    }

    if (row.handoff_id) {
      await creditAgentCommissionForQuotePayment(conn, {
        quotePaymentId: Number(row.id),
        quoteId: Number(row.quote_id || 0),
        handoffId: Number(row.handoff_id || 0),
        purpose,
        amountNgn: amountValue,
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
