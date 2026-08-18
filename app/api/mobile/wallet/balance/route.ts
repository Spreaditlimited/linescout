import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WalletBalanceRow = RowDataPacket & {
  id: number;
  balance: string;
  currency: string;
};

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const wallet = await queryOne<WalletBalanceRow>(
      `SELECT id, balance, currency
       FROM linescout_wallets
       WHERE owner_type = 'user' AND owner_id = ?
       LIMIT 1`,
      [user.id],
    );
    return NextResponse.json({
      ok: true,
      wallet: wallet
        ? {
            id: Number(wallet.id),
            balance: wallet.balance,
            currency: wallet.currency,
          }
        : { id: null, balance: 0, currency: "NGN" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Server error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}
