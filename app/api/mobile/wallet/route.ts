import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvidusConfig, normalizeProvidusBaseUrl, providusHeaders } from "@/lib/providus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WalletRow = {
  id: number;
  balance: string;
  currency: string;
};

async function ensureWallet(conn: any, userId: number) {
  const [rows]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'user' AND owner_id = ? LIMIT 1`,
    [userId]
  );
  if (rows?.length) return rows[0] as WalletRow;

  await conn.query(
    `INSERT INTO linescout_wallets (owner_type, owner_id, currency, balance, status)
     VALUES ('user', ?, 'NGN', 0, 'active')`,
    [userId]
  );

  const [created]: any = await conn.query(
    `SELECT id, balance, currency FROM linescout_wallets WHERE owner_type = 'user' AND owner_id = ? LIMIT 1`,
    [userId]
  );
  return created?.[0] as WalletRow;
}

async function ensureVirtualAccount(conn: any, userId: number, accountName: string) {
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
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.requestSuccessful || !data?.account_number) {
    const msg = data?.responseMessage || `Providus create account failed (${res.status})`;
    throw new Error(msg);
  }

  await conn.query(
    `INSERT INTO linescout_virtual_accounts
      (owner_type, owner_id, provider, account_number, account_name, bvn)
     VALUES ('user', ?, 'providus', ?, ?, ?)`,
    [userId, String(data.account_number), String(data.account_name || accountName || ""), String(data.bvn || "")]
  );

  return { account_number: String(data.account_number), account_name: String(data.account_name || "") };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      const [userRows]: any = await conn.query(
        `SELECT display_name, email FROM users WHERE id = ? LIMIT 1`,
        [user.id]
      );
      const displayName = String(userRows?.[0]?.display_name || "").trim();
      const accountName = displayName || (user.email ? user.email.split("@")[0] : `User ${user.id}`);

      const wallet = await ensureWallet(conn, user.id);
      const vAccount = await ensureVirtualAccount(conn, user.id, accountName);

      const [txRows]: any = await conn.query(
        `SELECT id, type, amount, currency, reason, reference_type, reference_id, created_at
         FROM linescout_wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC
         LIMIT 30`,
        [wallet.id]
      );

      const [payoutRows]: any = await conn.query(
        `SELECT id, amount, status, rejection_reason, created_at
         FROM linescout_user_payout_requests
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 20`,
        [user.id]
      );

      const [bankRows]: any = await conn.query(
        `SELECT bank_code, account_number, status
         FROM linescout_user_payout_accounts
         WHERE user_id = ?
         LIMIT 1`,
        [user.id]
      );

      return NextResponse.json({
        ok: true,
        wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
        virtual_account: vAccount,
        transactions: txRows || [],
        payouts: payoutRows || [],
        payout_account: bankRows?.[0] || null,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
