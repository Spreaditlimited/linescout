import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
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
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return { ok: true as const, userId: Number(rows[0].id), role: String(rows[0].role || "") };
  } finally {
    conn.release();
  }
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

  // Paystack returns {status:false, message:"..."} on many failures
  if (!res.ok || !json?.status) {
    const msg = String(json?.message || raw || `Paystack resolve failed (${res.status})`);
    // Treat resolve failures as user input issue (400), not server crash
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
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const bodyBankCode = clean(body?.bank_code);
  const bodyAccountNumber = clean(body?.account_number);

  const conn = await db.getConnection();
  try {
    // Load existing row (if any)
    const [rows]: any = await conn.query(
      `
      SELECT id, bank_code, account_number
      FROM linescout_agent_payout_accounts
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [auth.userId]
    );

    const existing = rows?.length ? rows[0] : null;

    // Allow body override (so you can test with real numbers without first upsert)
    const bankCode = bodyBankCode || String(existing?.bank_code || "").trim();
    const accountNumber = bodyAccountNumber || String(existing?.account_number || "").trim();

    if (!bankCode) {
      return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ ok: false, error: "account_number must be 10 digits" }, { status: 400 });
    }

    // Ensure a row exists and store latest submitted values as pending before resolving
    await conn.query(
      `
      INSERT INTO linescout_agent_payout_accounts
        (internal_user_id, bank_code, account_number, status, verified_at, created_at, updated_at)
      VALUES
        (?, ?, ?, 'pending', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        bank_code = VALUES(bank_code),
        account_number = VALUES(account_number),
        status = 'pending',
        verified_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      `,
      [auth.userId, bankCode, accountNumber]
    );

    const resolved = await paystackResolveAccount(accountNumber, bankCode);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    await conn.query(
      `
      UPDATE linescout_agent_payout_accounts
      SET
        account_name = ?,
        paystack_ref = 'paystack_resolve',
        verified_at = NOW(),
        status = 'verified',
        updated_at = CURRENT_TIMESTAMP
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [resolved.account_name, auth.userId]
    );

    return NextResponse.json({ ok: true, account_name: resolved.account_name });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to verify payout account");
    console.error("POST /api/internal/agents/payout-accounts/verify error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}