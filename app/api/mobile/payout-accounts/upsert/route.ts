import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v || "").trim();
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const bankCode = clean(body?.bank_code);
    const accountNumber = clean(body?.account_number);

    if (!bankCode) {
      return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
    }
    if (!accountNumber || accountNumber.length < 6) {
      return NextResponse.json({ ok: false, error: "account_number is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await conn.query(
        `INSERT INTO linescout_user_payout_accounts
          (user_id, bank_code, account_number, status, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', NULL, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           bank_code = VALUES(bank_code),
           account_number = VALUES(account_number),
           status = 'pending',
           verified_at = NULL,
           updated_at = NOW()`,
        [user.id, bankCode, accountNumber]
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
