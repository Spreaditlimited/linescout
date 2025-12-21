import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  });
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
 *   paidAt?: ISO string
 * }
 */
export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

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
    } = body;

    const hid = Number(handoffId);
    const amt = Number(amount);

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
      return NextResponse.json(
        { ok: false, error: "Invalid payment purpose" },
        { status: 400 }
      );
    }

    conn = await db();
    await conn.beginTransaction();

    // set or update total due (only when provided)
    if (totalDue !== undefined) {
      const td = Number(totalDue);
      if (Number.isNaN(td) || td < 0) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "totalDue must be >= 0" },
          { status: 400 }
        );
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
      return NextResponse.json(
        { ok: false, error: "Invalid paidAt" },
        { status: 400 }
      );
    }

    await conn.query(
      `INSERT INTO linescout_handoff_payments
       (handoff_id, amount, currency, purpose, note, paid_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hid, amt, currency, purpose, note, paid_at]
    );

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("handoff payments POST error", e);
    try {
      if (conn) await conn.rollback();
    } catch {}
    return NextResponse.json(
      { ok: false, error: "Failed to save payment" },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.end();
  }
}