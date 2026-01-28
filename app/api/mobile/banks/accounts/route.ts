import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/banks/accounts
 * - signed-in users only
 * - returns ALL ACTIVE official bank accounts (safe to show customers)
 */
export async function GET(req: Request) {
  try {
    await requireUser(req);

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT
          a.id,
          a.purpose,
          a.account_name,
          a.account_number,
          b.name AS bank_name
        FROM linescout_bank_accounts a
        JOIN linescout_banks b ON b.id = a.bank_id
        WHERE a.is_active = 1
          AND b.is_active = 1
        ORDER BY a.purpose ASC, b.name ASC, a.account_name ASC, a.id ASC
        `
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}