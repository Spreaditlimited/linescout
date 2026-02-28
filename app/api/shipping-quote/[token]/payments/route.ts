import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureShippingQuoteTables(conn);
    const [rows]: any = await conn.query(
      `SELECT q.id
       FROM linescout_shipping_quotes q
       WHERE q.token = ?
       LIMIT 1`,
      [safeToken]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const quoteId = Number(rows[0].id);
    const [sumRows]: any = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS total_paid
       FROM linescout_shipping_quote_payments
       WHERE shipping_quote_id = ?`,
      [quoteId]
    );

    const [paymentRows]: any = await conn.query(
      `SELECT id, purpose, method, status, amount, currency, provider_ref, created_at, paid_at
       FROM linescout_shipping_quote_payments
       WHERE shipping_quote_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      [quoteId]
    );

    const row = sumRows?.[0] || {};
    return NextResponse.json({
      ok: true,
      handoff_status: null,
      totals: {
        deposit_paid: 0,
        product_paid: 0,
        shipping_paid: Number(row.total_paid || 0),
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
