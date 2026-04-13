import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseJsonSafe(raw: any) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const paymentId = Number(body?.payment_id || 0);
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "payment_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT qp.id, qp.status, qp.processing_fee_meta_json
       FROM linescout_quote_payments qp
       JOIN linescout_quotes q ON q.id = qp.quote_id
       WHERE q.token = ?
         AND qp.id = ?
       LIMIT 1`,
      [safeToken, paymentId]
    );
    const row = rows?.[0];
    if (!row?.id) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }
    if (String(row.status || "").toLowerCase() !== "pending") {
      return NextResponse.json({ ok: false, error: "Only pending payments can be confirmed." }, { status: 400 });
    }

    const meta = parseJsonSafe(row.processing_fee_meta_json) || {};
    if (!meta?.direct_bank_transfer) {
      return NextResponse.json({ ok: false, error: "This payment is not a direct bank transfer." }, { status: 400 });
    }

    const nextMeta = {
      ...meta,
      customer_confirmed_at: new Date().toISOString(),
      customer_confirmation_source: "quote_client",
    };

    await conn.query(
      `UPDATE linescout_quote_payments
       SET processing_fee_meta_json = ?
       WHERE id = ?`,
      [JSON.stringify(nextMeta), paymentId]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}

