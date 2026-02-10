import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT q.id, h.status AS handoff_status
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [safeToken]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const quoteId = Number(rows[0].id);
    const handoffStatus = String(rows[0].handoff_status || "").trim() || null;
    const [sumRows]: any = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN purpose = 'deposit' AND status = 'paid' THEN amount ELSE 0 END), 0) AS deposit_paid,
         COALESCE(SUM(CASE WHEN purpose IN ('product_balance','full_product_payment') AND status = 'paid' THEN amount ELSE 0 END), 0) AS product_paid,
         COALESCE(SUM(CASE WHEN purpose = 'shipping_payment' AND status = 'paid' THEN amount ELSE 0 END), 0) AS shipping_paid
       FROM linescout_quote_payments
       WHERE quote_id = ?`,
      [quoteId]
    );

    const [paymentRows]: any = await conn.query(
      `SELECT id, purpose, method, status, amount, currency, provider_ref, created_at, paid_at
       FROM linescout_quote_payments
       WHERE quote_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      [quoteId]
    );

    const row = sumRows?.[0] || {};
    return NextResponse.json({
      ok: true,
      handoff_status: handoffStatus,
      totals: {
        deposit_paid: Number(row.deposit_paid || 0),
        product_paid: Number(row.product_paid || 0),
        shipping_paid: Number(row.shipping_paid || 0),
      },
      payments: (paymentRows || []).map((p: any) => ({
        id: Number(p.id),
        purpose: p.purpose,
        method: p.method,
        status: p.status,
        amount: Number(p.amount || 0),
        currency: p.currency || "NGN",
        provider_ref: p.provider_ref || null,
        created_at: p.created_at,
        paid_at: p.paid_at,
      })),
    });
  } finally {
    conn.release();
  }
}
