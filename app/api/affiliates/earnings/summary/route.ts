import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAffiliateTables, getAffiliateEarningsSnapshot } from "@/lib/affiliates";
import { requireAffiliate } from "@/lib/affiliate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const affiliate = await requireAffiliate(req);
    const conn = await db.getConnection();
    try {
      await ensureAffiliateTables(conn);
      const summary = await getAffiliateEarningsSnapshot(conn, affiliate.id);
      return NextResponse.json({ ok: true, summary });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}

