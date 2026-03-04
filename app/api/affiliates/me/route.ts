import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAffiliateTables } from "@/lib/affiliates";
import { requireAffiliate } from "@/lib/affiliate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const affiliate = await requireAffiliate(req);
    const conn = await db.getConnection();
    try {
      await ensureAffiliateTables(conn);
      const [acctRows]: any = await conn.query(
        `
        SELECT provider, provider_account, status, verified_at, currency, country_id
        FROM linescout_affiliate_payout_accounts
        WHERE affiliate_id = ?
        LIMIT 1
        `,
        [affiliate.id]
      );

      return NextResponse.json({
        ok: true,
        affiliate,
        payout_account: acctRows?.[0] || null,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}

