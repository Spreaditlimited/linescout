import { NextResponse } from "next/server";
import { headers } from "next/headers";
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

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();

  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return { ok: true as const, userId: Number(rows[0].id), role: String(rows[0].role || "") };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const otp = clean(body?.otp);

  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ ok: false, error: "OTP must be 6 digits" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, bank_code, account_number, otp_hash, otp_salt, expires_at, used_at
       FROM linescout_payout_account_otps
       WHERE owner_type = 'agent' AND owner_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [auth.userId]
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
      `INSERT INTO linescout_agent_payout_accounts
        (internal_user_id, bank_code, account_number, status, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         bank_code = VALUES(bank_code),
         account_number = VALUES(account_number),
         status = 'pending',
         verified_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [auth.userId, bankCode, accountNumber]
    );

    const resolved = await paystackResolveAccount(accountNumber, bankCode);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    await conn.query(
      `UPDATE linescout_agent_payout_accounts
       SET
         account_name = ?,
         paystack_ref = 'paystack_resolve',
         verified_at = NOW(),
         status = 'verified',
         updated_at = CURRENT_TIMESTAMP
       WHERE internal_user_id = ?
       LIMIT 1`,
      [resolved.account_name, auth.userId]
    );

    return NextResponse.json({ ok: true, account_name: resolved.account_name });
  } finally {
    conn.release();
  }
}
