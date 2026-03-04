import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAffiliateTables } from "@/lib/affiliates";
import { requireAffiliate } from "@/lib/affiliate-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const affiliate = await requireAffiliate(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
    const cursor = Number(searchParams.get("cursor") || 0);

    const conn = await db.getConnection();
    try {
      await ensureAffiliateTables(conn);

      const [rows]: any = await conn.query(
        `
        SELECT id, amount, currency, status, requested_note, admin_note, requested_at, approved_at, paid_at
        FROM linescout_affiliate_payout_requests
        WHERE affiliate_id = ?
          AND (? = 0 OR id < ?)
        ORDER BY id DESC
        LIMIT ?
        `,
        [affiliate.id, cursor, cursor, limit]
      );

      const nextCursor = rows?.length ? Number(rows[rows.length - 1].id || 0) : null;
      return NextResponse.json({ ok: true, items: rows || [], next_cursor: nextCursor });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}

