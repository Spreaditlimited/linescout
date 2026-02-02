import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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
    return {
      ok: false as const,
      status: 500 as const,
      error: "Paystack did not return account_name/account_number",
    };
  }

  return { ok: true as const, account_name: acctName, account_number: acctNo };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const bodyBankCode = clean(body?.bank_code);
    const bodyAccountNumber = clean(body?.account_number);

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `SELECT id, bank_code, account_number
         FROM linescout_user_payout_accounts
         WHERE user_id = ?
         LIMIT 1`,
        [user.id]
      );

      const existing = rows?.length ? rows[0] : null;
      const bankCode = bodyBankCode || String(existing?.bank_code || "").trim();
      const accountNumber = bodyAccountNumber || String(existing?.account_number || "").trim();

      if (!bankCode) {
        return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
      }
      if (!/^\d{10}$/.test(accountNumber)) {
        return NextResponse.json({ ok: false, error: "account_number must be 10 digits" }, { status: 400 });
      }

      await conn.query(
        `INSERT INTO linescout_user_payout_accounts
          (user_id, bank_code, account_number, status, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           bank_code = VALUES(bank_code),
           account_number = VALUES(account_number),
           status = 'pending',
           verified_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [user.id, bankCode, accountNumber]
      );

      const resolved = await paystackResolveAccount(accountNumber, bankCode);
      if (!resolved.ok) {
        return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
      }

      await conn.query(
        `UPDATE linescout_user_payout_accounts
         SET
           account_name = ?,
           paystack_ref = 'paystack_resolve',
           verified_at = NOW(),
           status = 'verified',
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
         LIMIT 1`,
        [resolved.account_name, user.id]
      );

      return NextResponse.json({ ok: true, account_name: resolved.account_name });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = String(e?.message || "Failed to verify payout account");
    console.error("POST /api/mobile/payout-accounts/verify error:", msg);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
