import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paypalVerifyPayment } from "@/lib/paypal";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";
import { ensureShipmentTables } from "@/lib/shipments";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";
import { ensureShippingQuotePaymentFeeColumns } from "@/lib/quote-payment-fees";

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
    await ensureShippingQuoteTables(conn);
    await ensureShippingQuotePaymentFeeColumns(conn);
    const [rows]: any = await conn.query(
      `SELECT id, shipping_quote_id, user_id, status, amount, currency, processing_fee_amount, COALESCE(base_amount, amount) AS base_amount
       FROM linescout_shipping_quote_payments
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
      currency: String(row.currency), customIdPrefix: 'LSSQ_' + row.shipping_quote_id + '_',
    });
    const currency = String(row.currency);
    const amountValue = num(capture.purchase_units[0].payments.captures[0].amount.value);
    await ensureShipmentTables(conn);
    await conn.beginTransaction();
    const [locked]: any = await conn.query('SELECT status FROM linescout_shipping_quote_payments WHERE id = ? FOR UPDATE', [row.id]);
    row.status = locked?.[0]?.status;
    if (!row.status) throw new Error('Payment record is missing.');
    const baseAmount = num(row.base_amount, 0) || amountValue;
    if (String(row.status || "") === "paid") {
      const [qRows]: any = await conn.query(
        `SELECT token FROM linescout_shipping_quotes WHERE id = ? LIMIT 1`,
        [row.shipping_quote_id]
      );
      await conn.commit();
      return NextResponse.json({
        ok: true,
        status: "paid",
        shipping_quote_id: Number(row.shipping_quote_id || 0),
        token: String(qRows?.[0]?.token || ""),
      });
    }

    await conn.query(
      `UPDATE linescout_shipping_quote_payments
       SET status = 'paid',
           paid_at = NOW()
       WHERE id = ?`,
      [row.id]
    );

    if (row.user_id) {
      await creditAffiliateEarning(conn, {
        referred_user_id: Number(row.user_id || 0),
        transaction_type: "shipping_payment",
        source_table: "linescout_shipping_quote_payments",
        source_id: Number(row.id),
        base_amount: baseAmount,
        currency: currency || "GBP",
      });
    }

    const [qRows]: any = await conn.query(
      `SELECT token, shipment_id FROM linescout_shipping_quotes WHERE id = ? LIMIT 1`,
      [row.shipping_quote_id]
    );
    const quoteToken = String(qRows?.[0]?.token || "");
    const shipmentId = Number(qRows?.[0]?.shipment_id || 0);

    if (shipmentId) {

      const [sRows]: any = await conn.query(
        `SELECT id, status FROM linescout_shipments WHERE id = ? LIMIT 1`,
        [shipmentId]
      );
      const shipment = sRows?.[0];
      if (shipment && String(shipment.status || "") === "draft") {
        await conn.query(`UPDATE linescout_shipments SET status = 'created' WHERE id = ?`, [shipmentId]);
        await conn.query(
          `INSERT INTO linescout_shipment_events
           (shipment_id, status, label, notes, event_time, source)
           VALUES (?, 'created', 'Payment received', 'Shipping payment confirmed via PayPal.', NOW(), 'payment')`,
          [shipmentId]
        );
      }
    }

    await conn.commit();
    return NextResponse.json({
      ok: true,
      status: "paid",
      shipping_quote_id: Number(row.shipping_quote_id || 0),
      token: quoteToken,
      amount: baseAmount,
      currency,
    });
  } catch (error) {
    await conn.rollback();
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Payment verification failed." }, { status: 409 });
  } finally {
    conn.release();
  }
}
