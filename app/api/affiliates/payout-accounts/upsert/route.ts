import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAffiliateTables, resolveCountryCurrency } from "@/lib/affiliates";
import { requireAffiliate } from "@/lib/affiliate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

async function paystackResolveAccount(accountNumber: string, bankCode: string) {
  const secret = clean(process.env.PAYSTACK_SECRET_KEY);
  if (!secret) {
    return { ok: false as const, status: 500 as const, error: "Missing PAYSTACK_SECRET_KEY" };
  }

  const qs = new URLSearchParams({
    account_number: accountNumber,
    bank_code: bankCode,
  }).toString();

  const url = `https://api.paystack.co/bank/resolve?${qs}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.status) {
    const msg = String(json?.message || raw || `Paystack resolve failed (${res.status})`);
    return { ok: false as const, status: 400 as const, error: msg };
  }

  const acctName = String(json?.data?.account_name || "").trim();
  const acctNo = String(json?.data?.account_number || "").trim();

  if (!acctName || !acctNo) {
    return { ok: false as const, status: 500 as const, error: "Paystack did not return account_name/account_number" };
  }

  return { ok: true as const, account_name: acctName, account_number: acctNo };
}

export async function POST(req: Request) {
  try {
    const affiliate = await requireAffiliate(req);
    const body = await req.json().catch(() => ({}));

    const conn = await db.getConnection();
    try {
      await ensureAffiliateTables(conn);
      const resolved = await resolveCountryCurrency(conn, affiliate.country_id || null);
      const countryIso2 = String(resolved?.country_iso2 || "").toUpperCase();
      const currencyCode = String(resolved?.currency_code || affiliate.payout_currency || "").toUpperCase();

      if (countryIso2 === "NG") {
        const bankCode = clean(body?.bank_code);
        const accountNumber = clean(body?.account_number);

        if (!bankCode) {
          return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
        }
        if (!/^\d{10}$/.test(accountNumber)) {
          return NextResponse.json({ ok: false, error: "account_number must be 10 digits" }, { status: 400 });
        }

        const resolvedAcct = await paystackResolveAccount(accountNumber, bankCode);
        if (!resolvedAcct.ok) {
          return NextResponse.json({ ok: false, error: resolvedAcct.error }, { status: resolvedAcct.status });
        }

        await conn.query(
          `
          INSERT INTO linescout_affiliate_payout_accounts
            (affiliate_id, provider, provider_account, country_id, currency, status, verified_at, paystack_ref, meta_json)
          VALUES
            (?, 'paystack', ?, ?, ?, 'verified', NOW(), 'paystack_resolve', ?)
          ON DUPLICATE KEY UPDATE
            provider = VALUES(provider),
            provider_account = VALUES(provider_account),
            country_id = VALUES(country_id),
            currency = VALUES(currency),
            status = 'verified',
            verified_at = NOW(),
            paystack_ref = 'paystack_resolve',
            meta_json = VALUES(meta_json),
            updated_at = CURRENT_TIMESTAMP
          `,
          [
            affiliate.id,
            accountNumber,
            affiliate.country_id || null,
            currencyCode || "NGN",
            JSON.stringify({ bank_code: bankCode, account_name: resolvedAcct.account_name }),
          ]
        );

        return NextResponse.json({ ok: true, account_name: resolvedAcct.account_name });
      }

      const paypalEmail = clean(body?.paypal_email || body?.provider_account);
      if (!paypalEmail || !paypalEmail.includes("@")) {
        return NextResponse.json({ ok: false, error: "PayPal email is required" }, { status: 400 });
      }

      await conn.query(
        `
        INSERT INTO linescout_affiliate_payout_accounts
          (affiliate_id, provider, provider_account, country_id, currency, status, verified_at)
        VALUES
          (?, 'paypal', ?, ?, ?, 'verified', NOW())
        ON DUPLICATE KEY UPDATE
          provider = VALUES(provider),
          provider_account = VALUES(provider_account),
          country_id = VALUES(country_id),
          currency = VALUES(currency),
          status = 'verified',
          verified_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
        `,
        [affiliate.id, paypalEmail, affiliate.country_id || null, currencyCode || "USD"]
      );

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

