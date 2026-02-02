import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount || 0);

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than 0" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [acctRows]: any = await conn.query(
        `SELECT bank_code, account_number, status
         FROM linescout_user_payout_accounts
         WHERE user_id = ?
         LIMIT 1`,
        [user.id]
      );
      if (!acctRows?.length) {
        return NextResponse.json({ ok: false, error: "Add your bank account first." }, { status: 400 });
      }

      const [walletRows]: any = await conn.query(
        `SELECT id, balance FROM linescout_wallets
         WHERE owner_type = 'user' AND owner_id = ?
         LIMIT 1`,
        [user.id]
      );

      if (!walletRows?.length) {
        return NextResponse.json({ ok: false, error: "Wallet not found." }, { status: 400 });
      }

      const walletId = Number(walletRows[0].id);
      const balance = Number(walletRows[0].balance || 0);

      if (balance < amount) {
        return NextResponse.json({ ok: false, error: "Insufficient balance." }, { status: 400 });
      }

      await conn.beginTransaction();

      const [res]: any = await conn.query(
        `INSERT INTO linescout_user_payout_requests
          (user_id, amount, status, created_at, updated_at)
         VALUES (?, ?, 'pending', NOW(), NOW())`,
        [user.id, amount]
      );

      const requestId = Number(res.insertId);
      const nextBalance = balance - amount;

      await conn.query(
        `INSERT INTO linescout_wallet_transactions
          (wallet_id, type, amount, currency, reason, reference_type, reference_id)
         VALUES (?, 'debit', ?, 'NGN', 'User payout request', 'user_payout_request', ?)`,
        [walletId, amount, requestId]
      );

      await conn.query(`UPDATE linescout_wallets SET balance = ?, updated_at = NOW() WHERE id = ?`, [
        nextBalance,
        walletId,
      ]);

      await conn.commit();

      return NextResponse.json({ ok: true, request_id: requestId, balance: nextBalance });
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {}
      return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
