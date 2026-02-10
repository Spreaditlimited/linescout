import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { selectPaymentProvider } from "@/lib/payment-provider";
import { getProvidusConfig, normalizeProvidusBaseUrl, providusHeaders } from "@/lib/providus";
import { buildNoticeEmail } from "@/lib/otp-email";
import { creditAgentCommissionForQuotePayment } from "@/lib/agent-commission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function computeTotals(
  items: any[],
  exchangeRmb: number,
  exchangeUsd: number,
  shippingRateUsd: number,
  shippingUnit: string,
  markupPercent: number
) {
  let totalProductRmb = 0;
  let totalLocalTransportRmb = 0;
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = num(item.quantity, 0);
    const unitPrice = num(item.unit_price_rmb, 0);
    const unitWeight = num(item.unit_weight_kg, 0);
    const unitCbm = num(item.unit_cbm, 0);
    const localTransport = num(item.local_transport_rmb, 0);

    totalProductRmb += qty * unitPrice;
    totalLocalTransportRmb += localTransport;
    totalWeightKg += qty * unitWeight;
    totalCbm += qty * unitCbm;
  }

  const totalProductRmbWithLocal = totalProductRmb + totalLocalTransportRmb;
  const totalProductNgn = totalProductRmbWithLocal * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductNgn,
    totalShippingNgn,
    totalMarkupNgn,
    totalDueNgn,
  };
}

function pickItems(raw: any) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw.items;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeDepositAmount(totalProductNgn: number, depositPercent: number) {
  const pct = Math.max(0, Math.min(100, depositPercent));
  return Math.round((totalProductNgn * pct) / 100);
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

async function ensureUserIdByEmail(conn: any, emailRaw: string, displayName?: string | null) {
  const email = String(emailRaw || "").trim();
  if (!email) return null;
  const normalized = email.toLowerCase();
  const [rows]: any = await conn.query(
    `SELECT id, display_name
     FROM users
     WHERE email_normalized = ? OR email = ?
     LIMIT 1`,
    [normalized, email]
  );
  if (rows?.length) {
    const id = Number(rows[0].id);
    if (displayName && !rows[0].display_name) {
      await conn.query(
        `UPDATE users SET display_name = ?, updated_at = NOW()
         WHERE id = ?`,
        [displayName, id]
      );
    }
    return id;
  }

  const [res]: any = await conn.query(
    `INSERT INTO users (email, email_normalized, display_name)
     VALUES (?, ?, ?)`,
    [email, normalized, displayName || null]
  );
  return Number(res.insertId || 0) || null;
}

async function ensureWallet(conn: any, userId: number) {
  const [rows]: any = await conn.query(
    `SELECT id, balance
     FROM linescout_wallets
     WHERE owner_type = 'user' AND owner_id = ?
     LIMIT 1`,
    [userId]
  );
  if (rows?.length) return rows[0];
  const [res]: any = await conn.query(
    `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
     VALUES ('user', ?, 'NGN', 0, 'active')`,
    [userId]
  );
  return { id: Number(res.insertId), balance: 0 };
}

async function ensureProvidusAccount(conn: any, userId: number, accountName: string) {
  const [rows]: any = await conn.query(
    `SELECT account_number, account_name
     FROM linescout_virtual_accounts
     WHERE owner_type = 'user' AND owner_id = ? AND provider = 'providus'
     LIMIT 1`,
    [userId]
  );
  if (rows?.length) return rows[0];

  const cfg = getProvidusConfig();
  if (!cfg.ok) throw new Error(cfg.error);
  const headers = providusHeaders();
  if (!headers.ok) throw new Error(headers.error);

  const url = `${normalizeProvidusBaseUrl(cfg.baseUrl)}/PiPCreateReservedAccountNumber`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers.headers,
    body: JSON.stringify({ account_name: accountName || `User ${userId}`, bvn: "" }),
  });
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok || !data?.requestSuccessful || !data?.account_number) {
    const msg = data?.responseMessage || raw || `Providus create account failed (${res.status})`;
    throw new Error(msg);
  }

  await conn.query(
    `INSERT INTO linescout_virtual_accounts
      (owner_type, owner_id, provider, account_number, account_name, bvn, meta_json)
     VALUES ('user', ?, 'providus', ?, ?, ?, ?)`,
    [
      userId,
      String(data.account_number),
      String(data.account_name || accountName || ""),
      String(data.bvn || ""),
      JSON.stringify(data || {}),
    ]
  );

  return { account_number: String(data.account_number), account_name: String(data.account_name || "") };
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const purpose = String(body?.purpose || "full_product_payment").trim();
  const useWallet = body?.use_wallet === true;
  const shippingTypeId = body?.shipping_type_id ? Number(body.shipping_type_id) : null;

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT q.*, h.email, h.customer_name, h.status AS handoff_status
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [safeToken]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });

    const quote = rows[0];
    const items = pickItems(quote.items_json);
    const handoffId = Number(quote.handoff_id || 0);
    const commitmentDue = Math.max(0, num(quote.commitment_due_ngn, 0));
    const handoffStatus = String(quote.handoff_status || "").toLowerCase();
    const depositEnabled = !!quote.deposit_enabled;
    const depositPercent = num(quote.deposit_percent, 0);

    const exchangeRmb = num(quote.exchange_rate_rmb, 0);
    const exchangeUsd = num(quote.exchange_rate_usd, 0);
    const markupPercent = num(quote.markup_percent, 0);

    const shipType = shippingTypeId || quote.shipping_type_id;
    let shippingRateUsd = num(quote.shipping_rate_usd, 0);
    let shippingRateUnit = String(quote.shipping_rate_unit || "per_kg");

    if (shipType) {
      const [rateRows]: any = await conn.query(
        `SELECT rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE shipping_type_id = ?
           AND is_active = 1
         ORDER BY id DESC
         LIMIT 1`,
        [shipType]
      );
      if (rateRows?.length) {
        shippingRateUsd = num(rateRows[0].rate_value, shippingRateUsd);
        shippingRateUnit = String(rateRows[0].rate_unit || shippingRateUnit);
      }
    }

    const totals = computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent);
    const productTarget = Math.max(0, Math.round(totals.totalProductNgn + totals.totalMarkupNgn - commitmentDue));

    const [paidRows]: any = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN purpose IN ('deposit','product_balance','full_product_payment') AND status = 'paid' THEN amount ELSE 0 END), 0) AS product_paid,
         COALESCE(SUM(CASE WHEN purpose = 'shipping_payment' AND status = 'paid' THEN amount ELSE 0 END), 0) AS shipping_paid
       FROM linescout_quote_payments
       WHERE quote_id = ?`,
      [quote.id]
    );

    const productPaid = num(paidRows?.[0]?.product_paid, 0);
    const shippingPaid = num(paidRows?.[0]?.shipping_paid, 0);

    let required = 0;
    if (purpose === "deposit") {
      if (!depositEnabled || depositPercent <= 0) {
        return NextResponse.json({ ok: false, error: "Deposit is not enabled for this quote" }, { status: 400 });
      }
      const depositAmount = computeDepositAmount(totals.totalProductNgn + totals.totalMarkupNgn, depositPercent);
      if (productPaid >= depositAmount) {
        return NextResponse.json({ ok: false, error: "Deposit already paid" }, { status: 400 });
      }
      required = Math.max(0, depositAmount - productPaid);
    } else if (purpose === "shipping_payment") {
      if (handoffStatus !== "shipped") {
        return NextResponse.json(
          { ok: false, error: "Shipping payment is available only after the project is shipped." },
          { status: 400 }
        );
      }
      if (productPaid < productTarget) {
        return NextResponse.json({ ok: false, error: "Product must be fully paid before shipping payment" }, { status: 400 });
      }
      required = Math.max(0, Math.round(totals.totalShippingNgn - shippingPaid));
    } else {
      required = Math.max(0, Math.round(productTarget - productPaid));
    }

    if (required <= 0) {
      return NextResponse.json({ ok: false, error: "Nothing due for this payment" }, { status: 400 });
    }

    let user: { id: number; email: string } | null = null;
    if (useWallet) {
      try {
        user = await requireUser(req);
      } catch {
        return NextResponse.json({ ok: false, error: "Sign in to use wallet" }, { status: 401 });
      }
    }

    let walletApplied = 0;
    let remaining = required;

    if (useWallet && user) {
      const [walletRows]: any = await conn.query(
        `SELECT id, balance
         FROM linescout_wallets
         WHERE owner_type = 'user' AND owner_id = ?
         LIMIT 1`,
        [user.id]
      );
      if (!walletRows?.length) {
        return NextResponse.json({ ok: false, error: "Wallet not found" }, { status: 400 });
      }
      const walletId = Number(walletRows[0].id);
      const balance = num(walletRows[0].balance, 0);
      walletApplied = Math.min(balance, required);

      if (walletApplied > 0) {
        const nextBalance = balance - walletApplied;
        const [walletPayIns]: any = await conn.query(
          `INSERT INTO linescout_quote_payments
           (quote_id, handoff_id, user_id, purpose, method, status, amount, currency, provider_ref, shipping_type_id, created_at, paid_at)
           VALUES (?, ?, ?, ?, 'wallet', 'paid', ?, 'NGN', NULL, ?, NOW(), NOW())`,
          [quote.id, handoffId || null, user.id, purpose, walletApplied, shipType || null]
        );
        const quotePaymentId = Number(walletPayIns?.insertId || 0);

        await conn.query(
          `INSERT INTO linescout_wallet_transactions
           (wallet_id, type, amount, currency, reason, reference_type, reference_id)
           VALUES (?, 'debit', ?, 'NGN', 'Quote payment', 'quote', ?)`,
          [walletId, walletApplied, quote.id]
        );

        await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
          nextBalance,
          walletId,
        ]);

        const handoffPurpose =
          purpose === "deposit" ? "downpayment" : purpose === "shipping_payment" ? "shipping_payment" : "full_payment";
        if (handoffId) {
          await conn.query(
            `INSERT INTO linescout_handoff_payments
             (handoff_id, amount, currency, purpose, note, paid_at, created_at)
             VALUES (?, ?, 'NGN', ?, 'Quote payment (wallet)', NOW(), NOW())`,
            [handoffId, walletApplied, handoffPurpose]
          );
        }

        if (quotePaymentId && handoffId) {
          await creditAgentCommissionForQuotePayment(conn, {
            quotePaymentId,
            quoteId: Number(quote.id),
            handoffId: Number(handoffId),
            purpose,
            amountNgn: walletApplied,
            currency: "NGN",
          });
        }

        const purposeLabel =
          purpose === "deposit" ? "Deposit" : purpose === "shipping_payment" ? "Shipping payment" : "Product payment";

        await conn.query(
          `INSERT INTO linescout_notifications
           (target, user_id, title, body, data_json)
           VALUES ('user', ?, ?, ?, ?)`,
          [
            user.id,
            "Payment received",
            `${purposeLabel} of NGN ${walletApplied.toLocaleString()} has been received.`,
            JSON.stringify({
              type: "quote_payment",
              quote_id: quote.id,
              handoff_id: handoffId || null,
              amount: walletApplied,
              purpose,
            }),
          ]
        );

        if (user.email) {
          const emailPack = buildNoticeEmail({
            subject: "Payment received",
            title: "Payment received",
            lines: [
              `Amount: NGN ${walletApplied.toLocaleString()}`,
              `Purpose: ${purposeLabel}`,
              quote.customer_name ? `Customer: ${quote.customer_name}` : "",
            ].filter(Boolean),
            footerNote: "This email was sent because a payment was confirmed on your LineScout quote.",
          });
          await sendEmail({ to: user.email, subject: emailPack.subject, text: emailPack.text, html: emailPack.html });
        }
      }

      remaining = Math.max(0, required - walletApplied);
    }

    if (remaining <= 0) {
      return NextResponse.json({ ok: true, wallet_applied: walletApplied, remaining: 0 });
    }

    const payer = user ? user.email : String(quote.email || "").trim();
    if (!payer || !payer.includes("@")) {
      return NextResponse.json({ ok: false, error: "Customer email is required to complete payment" }, { status: 400 });
    }

    let ownerUserId = user?.id || null;
    if (!ownerUserId) {
      ownerUserId = await ensureUserIdByEmail(conn, payer, quote.customer_name || null);
    }

    const providerSelection = ownerUserId
      ? await selectPaymentProvider(conn, "user", ownerUserId)
      : { provider: "paystack" };
    const provider = providerSelection.provider;

    if (provider !== "paystack") {
      if (!ownerUserId) {
        return NextResponse.json({ ok: false, error: "Customer account not found." }, { status: 400 });
      }

      await ensureWallet(conn, ownerUserId);
      const accountName = String(quote.customer_name || payer.split("@")[0] || `User ${ownerUserId}`);
      const account = await ensureProvidusAccount(conn, ownerUserId, accountName);

      await conn.query(
        `INSERT INTO linescout_quote_payments
         (quote_id, handoff_id, user_id, purpose, method, status, amount, currency, provider_ref, shipping_type_id, created_at)
         VALUES (?, ?, ?, ?, 'providus', 'pending', ?, 'NGN', NULL, ?, NOW())`,
        [quote.id, handoffId || null, ownerUserId, purpose, remaining, shipType || null]
      );

      return NextResponse.json({
        ok: true,
        provider: "providus",
        wallet_applied: walletApplied,
        remaining,
        account_number: account.account_number,
        account_name: account.account_name || accountName,
        bank_name: "Providus Bank",
        note: "Transfer the exact amount to the account above. Payment will reflect automatically.",
      });
    }

    const secret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Missing PAYSTACK_SECRET_KEY" }, { status: 500 });
    }

    const reference = `LSQ_${quote.id}_${Date.now()}`;
    await conn.query(
      `INSERT INTO linescout_quote_payments
       (quote_id, handoff_id, user_id, purpose, method, status, amount, currency, provider_ref, shipping_type_id, created_at)
       VALUES (?, ?, ?, ?, 'paystack', 'pending', ?, 'NGN', ?, ?, NOW())`,
      [quote.id, handoffId || null, user?.id || null, purpose, remaining, reference, shipType || null]
    );

    const origin = new URL(req.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
    const callbackUrl = `${baseUrl}/quote/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(String(quote.token || ""))}`;

    const initPayload = {
      email: payer,
      amount: Math.round(remaining * 100),
      reference,
      callback_url: callbackUrl,
      metadata: {
        payment_kind: "quote",
        quote_id: quote.id,
        handoff_id: handoffId,
        purpose,
        shipping_type_id: shipType,
        quote_token: quote.token,
      },
    };

    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initPayload),
    });

    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.status || !j?.data?.authorization_url) {
      return NextResponse.json({ ok: false, error: j?.message || "Paystack init failed" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      wallet_applied: walletApplied,
      remaining,
      provider: "paystack",
      reference,
      authorization_url: j.data.authorization_url,
    });
  } finally {
    conn.release();
  }
}
