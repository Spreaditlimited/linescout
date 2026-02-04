import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvidusConfig, providusSignature } from "@/lib/providus";
import { buildNoticeEmail } from "@/lib/otp-email";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responsePayload(sessionId: string, responseCode: "00" | "01" | "02" | "03", message: string) {
  return {
    requestSuccessful: true,
    sessionId,
    responseMessage: message,
    responseCode,
  };
}

async function sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
  const nodemailer = require("nodemailer") as any;
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
}

export async function POST(req: Request) {
  const cfg = getProvidusConfig();
  if (!cfg.ok) {
    return NextResponse.json(responsePayload("", "03", cfg.error), { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "").trim();
  const settlementId = String(body?.settlementId || "").trim();
  const accountNumber = String(body?.accountNumber || "").trim();

  const headerSig = String(req.headers.get("x-auth-signature") || "").trim();
  const expectedSig = providusSignature(cfg.clientId, cfg.clientSecret);
  if (!headerSig || headerSig.toLowerCase() !== expectedSig.toLowerCase()) {
    return NextResponse.json(responsePayload(sessionId, "02", "rejected transaction"), { status: 200 });
  }

  if (!settlementId || !accountNumber) {
    return NextResponse.json(responsePayload(sessionId, "02", "rejected transaction"), { status: 200 });
  }

  const conn = await db.getConnection();
  try {
    // Ensure account exists
    const [acctRows]: any = await conn.query(
      `SELECT id, owner_type, owner_id
       FROM linescout_virtual_accounts
       WHERE provider = 'providus' AND account_number = ?
       LIMIT 1`,
      [accountNumber]
    );

    if (!acctRows?.length) {
      return NextResponse.json(responsePayload(sessionId, "02", "rejected transaction"), { status: 200 });
    }

    // Duplicate check by settlement_id
    const [dupRows]: any = await conn.query(
      `SELECT id FROM linescout_provider_transactions
       WHERE provider = 'providus' AND settlement_id = ?
       LIMIT 1`,
      [settlementId]
    );
    if (dupRows?.length) {
      return NextResponse.json(responsePayload(sessionId, "01", "duplicate transaction"), { status: 200 });
    }

    const amount = Number(body?.transactionAmount || 0);
    const settledAmount = Number(body?.settledAmount || 0);
    const feeAmount = Number(body?.feeAmount || 0);
    const vatAmount = Number(body?.vatAmount || 0);
    const currency = String(body?.currency || "NGN").trim() || "NGN";

    const acct = acctRows[0];

    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO linescout_provider_transactions
        (provider, settlement_id, session_id, account_number, transaction_amount, settled_amount,
         fee_amount, vat_amount, currency, tran_remarks, source_account_number, source_account_name,
         source_bank_name, channel_id, tran_date_time, raw_json)
       VALUES
        ('providus', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementId,
        sessionId,
        accountNumber,
        amount,
        settledAmount,
        feeAmount,
        vatAmount,
        currency,
        String(body?.tranRemarks || ""),
        String(body?.sourceAccountNumber || ""),
        String(body?.sourceAccountName || ""),
        String(body?.sourceBankName || ""),
        String(body?.channelId || ""),
        String(body?.tranDateTime || ""),
        JSON.stringify(body || {}),
      ]
    );

    // Ensure wallet exists
    const [walletRows]: any = await conn.query(
      `SELECT id, balance
       FROM linescout_wallets
       WHERE owner_type = ? AND owner_id = ?
       LIMIT 1`,
      [acct.owner_type, acct.owner_id]
    );

    let walletId: number;
    let walletBalance = 0;
    if (walletRows?.length) {
      walletId = Number(walletRows[0].id);
      walletBalance = Number(walletRows[0].balance || 0);
    } else {
      const [res]: any = await conn.query(
        `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
         VALUES (?, ?, 'NGN', 0, 'active')`,
        [acct.owner_type, acct.owner_id]
      );
      walletId = Number(res.insertId);
      walletBalance = 0;
    }

    const creditAmount = settledAmount || amount;
    const newBalance = walletBalance + creditAmount;

    await conn.query(
      `INSERT INTO linescout_wallet_transactions
        (wallet_id, type, amount, currency, reason, reference_type, reference_id, provider, settlement_id, meta_json)
       VALUES (?, 'credit', ?, ?, ?, 'providus_settlement', ?, 'providus', ?, ?)`,
      [
        walletId,
        creditAmount,
        currency,
        "Providus transfer",
        settlementId,
        settlementId,
        JSON.stringify({ sessionId, accountNumber }),
      ]
    );

    await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
      newBalance,
      walletId,
    ]);

    // Try to auto-apply to a pending Providus quote payment if there's a single exact match.
    if (acct.owner_type === "user") {
      const [pendingRows]: any = await conn.query(
        `SELECT id, quote_id, handoff_id, amount, purpose
         FROM linescout_quote_payments
         WHERE user_id = ?
           AND method = 'providus'
           AND status = 'pending'
           AND amount = ?
         ORDER BY id ASC`,
        [acct.owner_id, creditAmount]
      );

      if (pendingRows?.length === 1) {
        const qp = pendingRows[0];
        await conn.query(
          `UPDATE linescout_quote_payments
           SET status = 'paid',
               paid_at = NOW()
           WHERE id = ?`,
          [qp.id]
        );

        const purpose = String(qp.purpose || "");
        const handoffPurpose =
          purpose === "deposit" ? "downpayment" : purpose === "shipping_payment" ? "shipping_payment" : "full_payment";
        if (qp.handoff_id) {
          await conn.query(
            `INSERT INTO linescout_handoff_payments
             (handoff_id, amount, currency, purpose, note, paid_at, created_at)
             VALUES (?, ?, ?, ?, 'Quote payment (providus)', NOW(), NOW())`,
            [qp.handoff_id, creditAmount, currency || "NGN", handoffPurpose]
          );
        }

        if (qp.handoff_id) {
          await creditAgentCommissionForQuotePayment(conn, {
            quotePaymentId: Number(qp.id),
            quoteId: Number(qp.quote_id || 0),
            handoffId: Number(qp.handoff_id || 0),
            purpose,
            amountNgn: creditAmount,
            currency: currency || "NGN",
          });
        }

        const [userRows]: any = await conn.query(
          `SELECT email, display_name
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [acct.owner_id]
        );
        const email = String(userRows?.[0]?.email || "");
        const displayName = String(userRows?.[0]?.display_name || "");
        const title = "Payment received";
        const purposeLabel =
          purpose === "deposit" ? "Deposit" : purpose === "shipping_payment" ? "Shipping payment" : "Product payment";

        await conn.query(
          `INSERT INTO linescout_notifications
           (target, user_id, title, body, data_json)
           VALUES ('user', ?, ?, ?, ?)`,
          [
            acct.owner_id,
            title,
            `${purposeLabel} of NGN ${creditAmount.toLocaleString()} has been received.`,
            JSON.stringify({
              type: "quote_payment",
              quote_id: qp.quote_id,
              handoff_id: qp.handoff_id,
              amount: creditAmount,
              purpose,
            }),
          ]
        );

        if (email) {
          const emailPack = buildNoticeEmail({
            subject: "Payment received",
            title: "Payment received",
            lines: [
              `Amount: NGN ${creditAmount.toLocaleString()}`,
              `Purpose: ${purposeLabel}`,
              displayName ? `Customer: ${displayName}` : "",
            ].filter(Boolean),
            footerNote: "This email was sent because a payment was confirmed on your LineScout quote.",
          });
          await sendEmail({ to: email, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
        }
      }
    }

    await conn.commit();

    return NextResponse.json(responsePayload(sessionId, "00", "success"), { status: 200 });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return NextResponse.json(responsePayload(String(body?.sessionId || ""), "03", "System Failure, Retry"), {
      status: 200,
    });
  } finally {
    conn.release();
  }
}
