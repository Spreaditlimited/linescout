import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const paymentId = Number(body?.payment_id || 0);

  if (!Number.isFinite(paymentId) || paymentId <= 0) {
    return NextResponse.json({ ok: false, error: "payment_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);

    const [rows]: any = await conn.query(
      `SELECT id, quote_id, handoff_id, user_id, purpose, status, amount, currency, created_at
       FROM linescout_quote_payments
       WHERE id = ? AND method = 'providus'
       LIMIT 1`,
      [paymentId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Providus payment record not found." }, { status: 404 });
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

    const userId = Number(row.user_id || 0);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Payment has no linked user. Cannot verify Providus transfer." },
        { status: 400 }
      );
    }

    const quoteAmount = num(row.amount, 0);
    const quoteCreatedAt = row.created_at || null;

    const [matchRows]: any = await conn.query(
      `SELECT
         pt.id,
         pt.settlement_id,
         pt.session_id,
         pt.account_number,
         pt.transaction_amount,
         pt.settled_amount,
         pt.fee_amount,
         pt.currency,
         pt.tran_date_time,
         pt.created_at
       FROM linescout_provider_transactions pt
       JOIN linescout_virtual_accounts va
         ON va.provider = 'providus'
        AND va.account_number = pt.account_number
       WHERE pt.provider = 'providus'
         AND va.owner_type = 'user'
         AND va.owner_id = ?
         AND (
           ROUND(COALESCE(pt.transaction_amount, 0), 2) = ROUND(?, 2)
           OR ROUND(COALESCE(pt.settled_amount, 0), 2) = ROUND(?, 2)
           OR ROUND(COALESCE(pt.settled_amount, 0) + COALESCE(pt.fee_amount, 0), 2) = ROUND(?, 2)
         )
         AND (? IS NULL OR pt.created_at >= DATE_SUB(?, INTERVAL 30 DAY))
         AND NOT EXISTS (
           SELECT 1
           FROM linescout_quote_payments qp2
           WHERE qp2.method = 'providus'
             AND qp2.status = 'paid'
             AND qp2.provider_ref = pt.settlement_id
         )
       ORDER BY
         CASE
           WHEN ROUND(COALESCE(pt.transaction_amount, 0), 2) = ROUND(?, 2) THEN 1
           WHEN ROUND(COALESCE(pt.settled_amount, 0) + COALESCE(pt.fee_amount, 0), 2) = ROUND(?, 2) THEN 2
           WHEN ROUND(COALESCE(pt.settled_amount, 0), 2) = ROUND(?, 2) THEN 3
           ELSE 9
         END,
         pt.created_at DESC
       LIMIT 2`,
      [
        userId,
        quoteAmount,
        quoteAmount,
        quoteAmount,
        quoteCreatedAt,
        quoteCreatedAt,
        quoteAmount,
        quoteAmount,
        quoteAmount,
      ]
    );

    let tx = matchRows?.[0] || null;
    let settlementId = tx ? String(tx.settlement_id || "").trim() || null : null;
    let sessionId = tx ? String(tx.session_id || "").trim() || null : null;
    let paidAmount = tx ? num(row.amount, 0) || num(tx.transaction_amount, 0) || num(tx.settled_amount, 0) : 0;
    let paidCurrency = tx ? String(tx.currency || row.currency || "NGN") : String(row.currency || "NGN");

    if (!tx) {
      // Fallback: reconcile from webhook-ingested Providus wallet credits for this user.
      const [walletMatchRows]: any = await conn.query(
        `SELECT
           t.id,
           COALESCE(NULLIF(TRIM(t.settlement_id), ''), NULLIF(TRIM(t.reference_id), '')) AS settlement_id,
           t.amount,
           t.currency,
           t.created_at
         FROM linescout_wallet_transactions t
         JOIN linescout_wallets w ON w.id = t.wallet_id
         WHERE w.owner_type = 'user'
           AND w.owner_id = ?
           AND t.provider = 'providus'
           AND t.reference_type = 'providus_settlement'
           AND t.type = 'credit'
           AND ROUND(COALESCE(t.amount, 0), 2) = ROUND(?, 2)
           AND (? IS NULL OR t.created_at >= DATE_SUB(?, INTERVAL 30 DAY))
           AND COALESCE(NULLIF(TRIM(t.settlement_id), ''), NULLIF(TRIM(t.reference_id), '')) IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM linescout_quote_payments qp2
             WHERE qp2.method = 'providus'
               AND qp2.status = 'paid'
               AND qp2.provider_ref = COALESCE(NULLIF(TRIM(t.settlement_id), ''), NULLIF(TRIM(t.reference_id), ''))
           )
         ORDER BY t.created_at DESC
         LIMIT 2`,
        [userId, quoteAmount, quoteCreatedAt, quoteCreatedAt]
      );

      if (walletMatchRows?.length === 1) {
        const wm = walletMatchRows[0];
        settlementId = String(wm.settlement_id || "").trim() || null;
        sessionId = null;
        paidAmount = num(row.amount, 0) || num(wm.amount, 0);
        paidCurrency = String(wm.currency || row.currency || "NGN");
        tx = { settlement_id: settlementId, session_id: null };
      } else if (walletMatchRows?.length > 1) {
        return NextResponse.json(
          {
            ok: false,
            error: "Multiple matching Providus settlements found. Please contact support to reconcile manually.",
          },
          { status: 409 }
        );
      }
    }

    if (!tx || !settlementId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No matching Providus settlement found yet for this pending quote payment.",
        },
        { status: 404 }
      );
    }

    if (matchRows.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error: "Multiple matching Providus settlements found. Please contact support to reconcile manually.",
        },
        { status: 409 }
      );
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE linescout_quote_payments
       SET status = 'paid',
           paid_at = NOW(),
           provider_ref = COALESCE(?, provider_ref)
       WHERE id = ?`,
      [settlementId, row.id]
    );

    const purpose = String(row.purpose || "");
    const handoffPurpose =
      purpose === "deposit" ? "downpayment" : purpose === "shipping_payment" ? "shipping_payment" : "full_payment";

    if (row.handoff_id) {
      const note = settlementId
        ? `Quote payment (providus · ${settlementId})`
        : "Quote payment (providus)";
      await conn.query(
        `INSERT INTO linescout_handoff_payments
         (handoff_id, amount, currency, purpose, note, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [row.handoff_id, paidAmount, paidCurrency || "NGN", handoffPurpose, note]
      );
    }

    if (row.handoff_id) {
      await creditAgentCommissionForQuotePayment(conn, {
        quotePaymentId: Number(row.id),
        quoteId: Number(row.quote_id || 0),
        handoffId: Number(row.handoff_id || 0),
        purpose,
        amountNgn: paidAmount,
        currency: paidCurrency || "NGN",
      });
    }

    if (row.user_id) {
      const affiliateType = purpose === "shipping_payment" ? "shipping_payment" : "project_payment";
      await creditAffiliateEarning(conn, {
        referred_user_id: Number(row.user_id || 0),
        transaction_type: affiliateType,
        source_table: "linescout_quote_payments",
        source_id: Number(row.id),
        base_amount: paidAmount,
        currency: paidCurrency || "NGN",
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
      settlement_id: settlementId,
      session_id: sessionId,
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
