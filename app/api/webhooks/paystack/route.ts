import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPaystackSignature } from "@/lib/paystack";
import { buildNoticeEmail } from "@/lib/otp-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNaira(amount: any) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 100);
}

function pickAccountNumber(data: any) {
  const candidates = [
    data?.dedicated_account?.account_number,
    data?.authorization?.account_number,
    data?.metadata?.account_number,
    data?.metadata?.dedicated_account?.account_number,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return null;
}

function pickCustomerCode(data: any) {
  const candidates = [
    data?.customer?.customer_code,
    data?.customer?.id,
    data?.metadata?.customer_code,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return null;
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
  const rawBody = await req.text().catch(() => "");
  const signature = req.headers.get("x-paystack-signature") || "";

  const sig = verifyPaystackSignature(rawBody, signature);
  if (!sig.ok) {
    return NextResponse.json({ ok: false, error: sig.error }, { status: 500 });
  }
  if (!sig.valid) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let payload: any = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  const event = String(payload?.event || "").trim();
  const data = payload?.data || {};

  if (event === "transfer.success") {
    const transferCode = String(data?.transfer_code || "").trim();
    const reference = String(data?.reference || "").trim();
    const status = String(data?.status || "").trim();
    const amountNgn = toNaira(data?.amount);
    const currency = String(data?.currency || "NGN").trim().toUpperCase();

    if (!transferCode && !reference) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const conn = await db.getConnection();
    try {
      const [userRows]: any = await conn.query(
        `
        SELECT id, user_id, amount, status, payout_email_sent_at
        FROM linescout_user_payout_requests
        WHERE paystack_reference = ? OR paystack_transfer_code = ?
        LIMIT 1
        `,
        [reference || null, transferCode || null]
      );

      if (userRows?.length) {
        const row = userRows[0];
        if (!row.payout_email_sent_at && status === "success") {
          const [urows]: any = await conn.query(`SELECT email, display_name FROM users WHERE id = ? LIMIT 1`, [
            row.user_id,
          ]);
          const userEmail = String(urows?.[0]?.email || "").trim();
          const userName = String(urows?.[0]?.display_name || "").trim();
          const fallbackUser = userEmail ? userEmail.split("@")[0] : "";
          const recipientName = userName || fallbackUser || null;

          await conn.query(
            `UPDATE linescout_user_payout_requests
             SET payout_email_sent_at = NOW(),
                 paystack_transfer_status = ?,
                 paid_at = COALESCE(paid_at, NOW()),
                 updated_at = NOW()
             WHERE id = ?`,
            [status || "success", row.id]
          );

          if (userEmail) {
            const emailPack = buildNoticeEmail({
              subject: "Your LineScout payout is complete",
              title: "Payout completed",
              lines: [
                `Amount: ${currency} ${Number(row.amount || 0).toLocaleString()}`,
                `Recipient: ${recipientName || "User"}`,
                "Your payout has been completed successfully.",
              ],
            });
            await sendEmail({ to: userEmail, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
          }
        }
        return NextResponse.json({ ok: true });
      }

      const [agentRows]: any = await conn.query(
        `
        SELECT id, internal_user_id, amount_kobo, status, payout_email_sent_at
        FROM linescout_agent_payout_requests
        WHERE paystack_reference = ? OR paystack_transfer_code = ?
        LIMIT 1
        `,
        [reference || null, transferCode || null]
      );

      if (agentRows?.length) {
        const row = agentRows[0];
        if (!row.payout_email_sent_at && status === "success") {
          const [arows]: any = await conn.query(
            `SELECT ap.email, ap.first_name, ap.last_name
             FROM linescout_agent_profiles ap
             WHERE ap.internal_user_id = ?
             LIMIT 1`,
            [row.internal_user_id]
          );
          const agentEmail = String(arows?.[0]?.email || "").trim();
          const agentName = `${String(arows?.[0]?.first_name || "").trim()} ${String(
            arows?.[0]?.last_name || ""
          ).trim()}`.trim();
          const fallbackAgent = agentEmail ? agentEmail.split("@")[0] : "";
          const recipientName = agentName || fallbackAgent || null;

          await conn.query(
            `UPDATE linescout_agent_payout_requests
             SET payout_email_sent_at = NOW(),
                 paystack_transfer_status = ?,
                 paid_at = COALESCE(paid_at, NOW()),
                 updated_at = NOW()
             WHERE id = ?`,
            [status || "success", row.id]
          );

          if (agentEmail) {
            const amount = Number(row.amount_kobo || 0) / 100;
            const emailPack = buildNoticeEmail({
              subject: "Your LineScout payout is complete",
              title: "Payout completed",
              lines: [
                `Amount: ${currency} ${amount.toLocaleString()}`,
                `Recipient: ${recipientName || "Agent"}`,
                "Your payout has been completed successfully.",
              ],
            });
            await sendEmail({ to: agentEmail, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
          }
        }
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: true, ignored: true });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    } finally {
      conn.release();
    }
  }

  if (event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (String(data?.metadata?.payment_kind || "") === "quote" || data?.metadata?.quote_id) {
    const reference = String(data?.reference || data?.transaction_reference || data?.id || "").trim();
    const amountNgn = toNaira(data?.amount);
    const currency = String(data?.currency || "NGN").trim().toUpperCase();

    if (!reference || !amountNgn || amountNgn <= 0) {
      return NextResponse.json({ ok: true, ignored: true });
    }

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
        return NextResponse.json({ ok: true, ignored: true });
      }

      const row = rows[0];
      if (String(row.status || "") === "paid") {
        return NextResponse.json({ ok: true, duplicate: true });
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

      await conn.commit();

      // Notify customer on successful quote payment
      const userId = Number(row.user_id || 0) || null;
      let email = "";
      let displayName = "";

      if (userId) {
        const [uRows]: any = await conn.query(
          `SELECT email, display_name
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [userId]
        );
        email = String(uRows?.[0]?.email || "");
        displayName = String(uRows?.[0]?.display_name || "");
      }

      if (!email && row.handoff_id) {
        const [hRows]: any = await conn.query(
          `SELECT email, customer_name
           FROM linescout_handoffs
           WHERE id = ?
           LIMIT 1`,
          [row.handoff_id]
        );
        email = String(hRows?.[0]?.email || "");
        displayName = String(hRows?.[0]?.customer_name || "");
      }

      const title = "Payment received";
      const purposeLabel =
        purpose === "deposit" ? "Deposit" : purpose === "shipping_payment" ? "Shipping payment" : "Product payment";
      if (userId) {
        await conn.query(
          `INSERT INTO linescout_notifications
           (target, user_id, title, body, data_json)
           VALUES ('user', ?, ?, ?, ?)`,
          [
            userId,
            title,
            `${purposeLabel} of NGN ${amountNgn.toLocaleString()} has been received.`,
            JSON.stringify({
              type: "quote_payment",
              quote_id: row.quote_id,
              handoff_id: row.handoff_id,
              amount: amountNgn,
              purpose,
            }),
          ]
        );
      }

      if (email) {
        const emailPack = buildNoticeEmail({
          subject: "Payment received",
          title: "Payment received",
          lines: [
            `Amount: NGN ${amountNgn.toLocaleString()}`,
            `Purpose: ${purposeLabel}`,
            displayName ? `Customer: ${displayName}` : "",
          ].filter(Boolean),
          footerNote: "This email was sent because a payment was confirmed on your LineScout quote.",
        });
        await sendEmail({ to: email, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
      }

      return NextResponse.json({ ok: true });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    } finally {
      conn.release();
    }
  }

  const reference = String(data?.reference || data?.transaction_reference || data?.id || "").trim();
  const amountNgn = toNaira(data?.amount);
  const currency = String(data?.currency || "NGN").trim().toUpperCase();
  const accountNumber = pickAccountNumber(data);
  const customerCode = pickCustomerCode(data);

  if (!amountNgn || amountNgn <= 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (reference) {
      const [dupRows]: any = await conn.query(
        `SELECT id
         FROM linescout_provider_transactions
         WHERE provider = 'paystack' AND settlement_id = ?
         LIMIT 1`,
        [reference]
      );
      if (dupRows?.length) {
        await conn.rollback();
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    let virtualAccount: any = null;
    if (accountNumber) {
      const [rows]: any = await conn.query(
        `SELECT id, owner_type, owner_id
         FROM linescout_virtual_accounts
         WHERE provider = 'paystack' AND account_number = ?
         LIMIT 1`,
        [accountNumber]
      );
      virtualAccount = rows?.[0] || null;
    }

    if (!virtualAccount && customerCode) {
      const [rows]: any = await conn.query(
        `SELECT id, owner_type, owner_id
         FROM linescout_virtual_accounts
         WHERE provider = 'paystack' AND provider_ref = ?
         LIMIT 1`,
        [customerCode]
      );
      virtualAccount = rows?.[0] || null;
    }

    if (!virtualAccount) {
      await conn.rollback();
      return NextResponse.json({ ok: true, ignored: true, error: "No matching virtual account" });
    }

    const ownerType = String(virtualAccount.owner_type || "");
    const ownerId = Number(virtualAccount.owner_id || 0);

    const [walletRows]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [ownerType, ownerId]
    );

    if (!walletRows?.length) {
      await conn.query(
        `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
         VALUES (?, ?, 'NGN', 0, 'active')`,
        [ownerType, ownerId]
      );
    }

    const [walletFinal]: any = await conn.query(
      `SELECT id, balance FROM linescout_wallets WHERE owner_type = ? AND owner_id = ? LIMIT 1`,
      [ownerType, ownerId]
    );

    const walletId = Number(walletFinal[0].id);
    const currentBalance = Number(walletFinal[0].balance || 0);
    const nextBalance = currentBalance + amountNgn;

    await conn.query(
      `INSERT INTO linescout_provider_transactions
        (provider, settlement_id, session_id, account_number, transaction_amount, settled_amount, fee_amount, vat_amount, currency, tran_remarks, source_account_number, source_account_name, source_bank_name, channel_id, tran_date_time, raw_json)
       VALUES ('paystack', ?, NULL, ?, ?, ?, 0, 0, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`,
      [
        reference || `paystack_${Date.now()}`,
        accountNumber || null,
        amountNgn,
        amountNgn,
        currency || "NGN",
        data?.channel || data?.gateway_response || data?.message || "paystack_deposit",
        rawBody || null,
      ]
    );

    await conn.query(
      `INSERT INTO linescout_wallet_transactions
        (wallet_id, type, amount, currency, reason, reference_type, reference_id)
       VALUES (?, 'credit', ?, ?, 'paystack_deposit', 'paystack', ?)`,
      [walletId, amountNgn, currency || "NGN", reference || null]
    );

    await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
      nextBalance,
      walletId,
    ]);

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
