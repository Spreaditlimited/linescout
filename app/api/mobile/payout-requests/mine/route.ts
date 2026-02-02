import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `SELECT id, amount, status, rejection_reason, approved_at, paid_at, created_at
         FROM linescout_user_payout_requests
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 50`,
        [user.id]
      );
      return NextResponse.json({ ok: true, items: rows || [] });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
