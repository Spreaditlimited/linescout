import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";

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
    const [rows]: any = await conn.query(
      `SELECT id, quote_id, handoff_id, user_id, purpose, status
       FROM linescout_quote_payments
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
         VALUES (?, ?, ?, ?, 'Quote payment (paystack)', NOW(), NOW())`,
        [row.handoff_id, amountNgn, currency || "NGN", handoffPurpose]
      );
    }

    if (row.handoff_id) {
      await creditAgentCommissionForQuotePayment(conn, {
        quotePaymentId: Number(row.id),
        quoteId: Number(row.quote_id || 0),
        handoffId: Number(row.handoff_id || 0),
        purpose,
        amountNgn,
        currency: currency || "NGN",
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
