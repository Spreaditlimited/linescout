import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";
import { ensureShipmentTables } from "@/lib/shipments";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const reference = String(body?.reference || "").trim();

  if (!reference) {
    return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
  }

  const secret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing PAYSTACK_SECRET_KEY" }, { status: 500 });
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }
  );
  const verifyJson: any = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !verifyJson?.status) {
    return NextResponse.json(
      { ok: false, error: verifyJson?.message || "Paystack verify failed" },
      { status: 400 }
    );
  }

  const data = verifyJson?.data || {};
  if (String(data?.status || "").toLowerCase() !== "success") {
    return NextResponse.json({ ok: false, error: "Payment not successful yet." }, { status: 400 });
  }

  const amountNgn = Math.round(num(data?.amount, 0) / 100);
  const currency = String(data?.currency || "NGN");

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await ensureShippingQuoteTables(conn);
    const [rows]: any = await conn.query(
      `SELECT id, shipping_quote_id, user_id, status
       FROM linescout_shipping_quote_payments
       WHERE provider_ref = ?
       LIMIT 1`,
      [reference]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Payment record not found." }, { status: 404 });
    }

    const row = rows[0];
    if (String(row.status || "") === "paid") {
      const [qRows]: any = await conn.query(
        `SELECT token FROM linescout_shipping_quotes WHERE id = ? LIMIT 1`,
        [row.shipping_quote_id]
      );
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
        base_amount: amountNgn,
        currency: currency || "NGN",
      });
    }

    const [qRows]: any = await conn.query(
      `SELECT token, shipment_id FROM linescout_shipping_quotes WHERE id = ? LIMIT 1`,
      [row.shipping_quote_id]
    );
    const quoteToken = String(qRows?.[0]?.token || "");
    const shipmentId = Number(qRows?.[0]?.shipment_id || 0);

    if (shipmentId) {
      await ensureShipmentTables(conn);
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
           VALUES (?, 'created', 'Payment received', 'Shipping payment confirmed via Paystack.', NOW(), 'payment')`,
          [shipmentId]
        );
      }
    }

    return NextResponse.json({
      ok: true,
      status: "paid",
      shipping_quote_id: Number(row.shipping_quote_id || 0),
      token: quoteToken,
      amount: amountNgn,
      currency,
    });
  } finally {
    conn.release();
  }
}
