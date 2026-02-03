import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
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
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const otp = clean(body?.otp);

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "OTP must be 6 digits" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `SELECT id, bank_code, account_number, otp_hash, otp_salt, expires_at, used_at, attempts
         FROM linescout_payout_account_otps
         WHERE owner_type = 'user' AND owner_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [user.id]
      );

      const row = rows?.[0];
      if (!row) {
        return NextResponse.json({ ok: false, error: "No pending OTP" }, { status: 400 });
      }
      if (row.used_at) {
        return NextResponse.json({ ok: false, error: "OTP already used" }, { status: 400 });
      }
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ ok: false, error: "OTP expired" }, { status: 400 });
      }

      const expected = hashOtp(otp, String(row.otp_salt || ""));
      if (expected !== String(row.otp_hash || "")) {
        await conn.query(
          `UPDATE linescout_payout_account_otps
           SET attempts = attempts + 1
           WHERE id = ?`,
          [row.id]
        );
        return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 400 });
      }

      const bankCode = clean(row.bank_code);
      const accountNumber = clean(row.account_number);

      await conn.query(
        `UPDATE linescout_payout_account_otps
         SET used_at = NOW()
         WHERE id = ?`,
        [row.id]
      );

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
    const msg = String(e?.message || "Failed to confirm change");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
