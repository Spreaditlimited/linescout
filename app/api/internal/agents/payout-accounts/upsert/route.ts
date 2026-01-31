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
      SELECT
        u.id,
        u.role,
        u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const r = rows[0];
    if (!r.is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return { ok: true as const, userId: Number(r.id), role: String(r.role || "") };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // Agents only (admins manage payouts from web later)
  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const bankCode = clean(body?.bank_code);
  const accountNumber = clean(body?.account_number);

  // Keep validation minimal but strict enough
  if (!bankCode) {
    return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json({ ok: false, error: "account_number must be 10 digits" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    // Store only. Verification via Paystack comes next.
    // Status stays 'pending' and verified_at stays NULL until verified.
    await conn.query(
      `
      INSERT INTO linescout_agent_payout_accounts
        (internal_user_id, bank_code, account_number, status, verified_at, updated_at, created_at)
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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "");

    // If table doesn't exist or schema mismatch, you'll see it immediately.
    console.error("POST /api/internal/agents/payout-accounts/upsert error:", msg || e);

    return NextResponse.json({ ok: false, error: "Failed to save payout account" }, { status: 500 });
  } finally {
    conn.release();
  }
}