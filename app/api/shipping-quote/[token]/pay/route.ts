import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { selectPaymentProvider } from "@/lib/payment-provider";
import { getProvidusConfig, normalizeProvidusBaseUrl, providusHeaders } from "@/lib/providus";
import { paypalCreateOrder } from "@/lib/paypal";
import { convertAmount } from "@/lib/fx";
import { ensureCountryConfig, ensureUserCountryColumns } from "@/lib/country-config";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";
import { creditAffiliateEarning, ensureAffiliateTables } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
      "",
      JSON.stringify(data),
    ]
  );

  return {
    account_number: String(data.account_number),
    account_name: String(data.account_name || accountName || ""),
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const purpose = String(body?.purpose || "shipping_payment");
  const useWallet = !!body?.use_wallet;
  const shippingRateId = body?.shipping_rate_id ? Number(body.shipping_rate_id) : null;
  const shippingTypeId = body?.shipping_type_id ? Number(body.shipping_type_id) : null;

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await ensureShippingQuoteTables(conn);
    await ensureCountryConfig(conn);
    await ensureUserCountryColumns(conn);
    const [rows]: any = await conn.query(
      `SELECT q.*, c.iso2 AS country_iso2
       FROM linescout_shipping_quotes q
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       WHERE q.token = ?
       LIMIT 1`,
      [safeToken]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

    const quote = rows[0];

    let user: any = null;
    if (useWallet) {
      try {
        user = await requireUser(req);
      } catch {
        return NextResponse.json({ ok: false, error: "Sign in to use wallet" }, { status: 401 });
      }
    }

    let walletApplied = 0;
    let remaining = 0;

    const payer = user ? user.email : String(quote.email || "").trim();
    if (!payer || !payer.includes("@")) {
      return NextResponse.json({ ok: false, error: "Customer email is required to complete payment" }, { status: 400 });
    }

    let ownerUserId = user?.id || null;
    if (!ownerUserId) {
      ownerUserId = await ensureUserIdByEmail(conn, payer, quote.customer_name || null);
    }

    let userCountryIso2 = "";
    let userCurrencyCode = "";
    if (ownerUserId) {
      const [userRows]: any = await conn.query(
        `SELECT u.display_currency_code, c.iso2 AS country_iso2, cur.code AS currency_code, c.settlement_currency_code
         FROM users u
         LEFT JOIN linescout_countries c ON c.id = u.country_id
         LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
         WHERE u.id = ?
         LIMIT 1`,
        [ownerUserId]
      );
      userCountryIso2 = String(userRows?.[0]?.country_iso2 || "").toUpperCase();
      userCurrencyCode = String(
        userRows?.[0]?.display_currency_code ||
          userRows?.[0]?.settlement_currency_code ||
          userRows?.[0]?.currency_code ||
          ""
      ).toUpperCase();
    }

    const countryIso2 = String(quote.country_iso2 || "").toUpperCase();
    const effectiveCountryIso2 = userCountryIso2 || countryIso2 || "NG";
    const isNigeria = effectiveCountryIso2 === "NG";

    let shippingRateUsd = Number(quote.shipping_rate_usd || 0);
    let shippingRateUnit = String(quote.shipping_rate_unit || "per_kg");
    let shippingTypeIdResolved = Number(quote.shipping_type_id || 0) || null;

    if (shippingRateId) {
      const [rateRows]: any = await conn.query(
        `SELECT shipping_type_id, rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE id = ?
           AND is_active = 1
           AND country_id = ?
         LIMIT 1`,
        [shippingRateId, quote.country_id]
      );
      if (rateRows?.length) {
        shippingTypeIdResolved = Number(rateRows[0].shipping_type_id || shippingTypeIdResolved || 0) || null;
        shippingRateUsd = num(rateRows[0].rate_value, shippingRateUsd);
        shippingRateUnit = String(rateRows[0].rate_unit || shippingRateUnit);
      }
    } else if (shippingTypeId) {
      const [rateRows]: any = await conn.query(
        `SELECT rate_value, rate_unit
         FROM linescout_shipping_rates
         WHERE shipping_type_id = ?
           AND is_active = 1
           AND country_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [shippingTypeId, quote.country_id]
      );
      if (rateRows?.length) {
        shippingTypeIdResolved = shippingTypeId;
        shippingRateUsd = num(rateRows[0].rate_value, shippingRateUsd);
        shippingRateUnit = String(rateRows[0].rate_unit || shippingRateUnit);
      }
    }

    const totalWeightKg = Number(quote.total_weight_kg || 0);
    const totalCbm = Number(quote.total_cbm || 0);
    const shippingUnits = shippingRateUnit === "per_cbm" ? totalCbm : totalWeightKg;
    let baseUsd = Number(quote.total_shipping_usd || 0);
    if (shippingRateUsd > 0 && shippingUnits > 0) {
      baseUsd = shippingUnits * shippingRateUsd;
    }
    if (!Number.isFinite(baseUsd) || baseUsd <= 0) {
      return NextResponse.json({ ok: false, error: "Shipping total is not available." }, { status: 400 });
    }

    if (shippingRateUsd > 0 && shippingUnits > 0) {
      const totalShippingNgn = await convertAmount(conn, baseUsd, "USD", "NGN");
      await conn.query(
        `UPDATE linescout_shipping_quotes
         SET shipping_type_id = ?, shipping_rate_usd = ?, shipping_rate_unit = ?, total_shipping_usd = ?, total_shipping_ngn = ?
         WHERE id = ?
         LIMIT 1`,
        [
          shippingTypeIdResolved,
          shippingRateUsd,
          shippingRateUnit,
          baseUsd,
          Number(totalShippingNgn || 0) || null,
          quote.id,
        ]
      );
    }

    let paymentCurrency = "USD";
    let totalDueBase = baseUsd;
    if (isNigeria) {
      const converted = await convertAmount(conn, baseUsd, "USD", "NGN");
      if (!converted || !Number.isFinite(converted) || converted <= 0) {
        return NextResponse.json(
          { ok: false, error: "USD exchange rate is not configured." },
          { status: 500 }
        );
      }
      paymentCurrency = "NGN";
      totalDueBase = converted;
    } else {
      const targetCurrency =
        userCurrencyCode ||
        String(quote.display_currency_code || "").toUpperCase() ||
        "USD";
      const converted =
        targetCurrency === "USD"
          ? baseUsd
          : await convertAmount(conn, baseUsd, "USD", targetCurrency);
      if (!converted || !Number.isFinite(converted) || converted <= 0) {
        return NextResponse.json(
          { ok: false, error: `${targetCurrency} exchange rate is not configured.` },
          { status: 500 }
        );
      }
      paymentCurrency = targetCurrency;
      totalDueBase = converted;
    }

    const [sumRows]: any = await conn.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' AND currency = ? THEN amount ELSE 0 END), 0) AS paid
       FROM linescout_shipping_quote_payments
       WHERE shipping_quote_id = ?`,
      [paymentCurrency, quote.id]
    );
    const paid = Number(sumRows?.[0]?.paid || 0);
    const required = Math.max(0, totalDueBase - paid);

    if (required <= 0) {
      return NextResponse.json({ ok: true, remaining: 0 });
    }

    if (useWallet && paymentCurrency !== "NGN") {
      return NextResponse.json(
        { ok: false, error: "Wallet payments are only available in NGN." },
        { status: 400 }
      );
    }

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
          `INSERT INTO linescout_shipping_quote_payments
           (shipping_quote_id, user_id, purpose, method, status, amount, currency, provider_ref, created_at, paid_at)
           VALUES (?, ?, ?, 'wallet', 'paid', ?, 'NGN', NULL, NOW(), NOW())`,
          [quote.id, user.id, purpose, walletApplied]
        );
        const paymentId = Number(walletPayIns?.insertId || 0);
        await conn.query(
          `INSERT INTO linescout_wallet_transactions
           (wallet_id, type, amount, currency, reason, reference_type, reference_id)
           VALUES (?, 'debit', ?, 'NGN', 'Shipping payment', 'shipping_quote', ?)`,
          [walletId, walletApplied, quote.id]
        );
        await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
          nextBalance,
          walletId,
        ]);

        if (paymentId) {
          await creditAffiliateEarning(conn, {
            referred_user_id: Number(user.id),
            transaction_type: "shipping_payment",
            source_table: "linescout_shipping_quote_payments",
            source_id: paymentId,
            base_amount: walletApplied,
            currency: "NGN",
          });
        }
      }
    }

    remaining = Math.max(0, required - walletApplied);

    if (remaining <= 0) {
      return NextResponse.json({ ok: true, wallet_applied: walletApplied, remaining: 0 });
    }

    let provider: string = "paystack";
    if (!isNigeria) {
      provider = "paypal";
    } else {
      const providerSelection = ownerUserId
        ? await selectPaymentProvider(conn, "user", ownerUserId)
        : { provider: "paystack" };
      provider = providerSelection.provider;
      if (provider === "paypal" || provider === "global") {
        provider = "paystack";
      }
    }

    if (provider === "paypal") {
      const paypalCurrency = paymentCurrency || "USD";
      const converted =
        paypalCurrency === paymentCurrency
          ? remaining
          : await convertAmount(conn, remaining, paymentCurrency, paypalCurrency);
      if (!converted || !Number.isFinite(converted) || converted <= 0) {
        return NextResponse.json(
          { ok: false, error: `${paypalCurrency} exchange rate is not configured.` },
          { status: 500 }
        );
      }

      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
      const returnUrl = `${baseUrl}/shipping-quote/paypal/verify?quote=${encodeURIComponent(String(quote.token || ""))}`;
      const cancelUrl = `${baseUrl}/shipping-quote/${encodeURIComponent(String(quote.token || ""))}`;
      const order = await paypalCreateOrder({
        amount: converted.toFixed(2),
        currency: paypalCurrency,
        returnUrl,
        cancelUrl,
        customId: `LSSQ_${quote.id}_${Date.now()}`,
        description: "LineScout shipping payment",
      });

      await conn.query(
        `INSERT INTO linescout_shipping_quote_payments
         (shipping_quote_id, user_id, purpose, method, status, amount, currency, provider_ref, created_at)
         VALUES (?, ?, ?, 'paypal', 'pending', ?, ?, ?, NOW())`,
        [quote.id, ownerUserId, purpose, converted, paypalCurrency, order.id]
      );

      return NextResponse.json({
        ok: true,
        provider: "paypal",
        approval_url: order.approveUrl,
        wallet_applied: walletApplied,
        remaining: converted,
        currency: paypalCurrency,
      });
    }

    if (provider !== "paystack") {
      if (!ownerUserId) {
        return NextResponse.json({ ok: false, error: "Customer account not found." }, { status: 400 });
      }

      await ensureWallet(conn, ownerUserId);
      const accountName = String(quote.customer_name || payer.split("@")[0] || `User ${ownerUserId}`);
      const account = await ensureProvidusAccount(conn, ownerUserId, accountName);

      await conn.query(
        `INSERT INTO linescout_shipping_quote_payments
         (shipping_quote_id, user_id, purpose, method, status, amount, currency, provider_ref, created_at)
         VALUES (?, ?, ?, 'providus', 'pending', ?, 'NGN', NULL, NOW())`,
        [quote.id, ownerUserId, purpose, remaining]
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

    const reference = `LSSQ_${quote.id}_${Date.now()}`;
    await conn.query(
      `INSERT INTO linescout_shipping_quote_payments
       (shipping_quote_id, user_id, purpose, method, status, amount, currency, provider_ref, created_at)
       VALUES (?, ?, ?, 'paystack', 'pending', ?, 'NGN', ?, NOW())`,
      [quote.id, user?.id || null, purpose, remaining, reference]
    );

    const origin = new URL(req.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
    const callbackUrl = `${baseUrl}/shipping-quote/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(String(quote.token || ""))}`;

    const initPayload = {
      email: payer,
      amount: Math.round(remaining * 100),
      reference,
      callback_url: callbackUrl,
      metadata: {
        payment_kind: "shipping_quote",
        shipping_quote_id: quote.id,
        purpose,
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
