import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         a.id,
         a.bank_id,
         a.purpose,
         a.account_name,
         a.account_number,
         b.name AS bank_name
       FROM linescout_bank_accounts a
       JOIN linescout_banks b ON b.id = a.bank_id
       WHERE a.is_active = 1
         AND b.is_active = 1
       ORDER BY b.name ASC, a.account_name ASC, a.id ASC`
    );
    return NextResponse.json({
      ok: true,
      items: (rows || []).map((r: any) => ({
        id: Number(r.id),
        bank_id: Number(r.bank_id || 0),
        bank_name: String(r.bank_name || "").trim(),
        account_name: String(r.account_name || "").trim(),
        account_number: String(r.account_number || "").trim(),
        purpose: String(r.purpose || "").trim(),
      })),
    });
  } finally {
    conn.release();
  }
}
