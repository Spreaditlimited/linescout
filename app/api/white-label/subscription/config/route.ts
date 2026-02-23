import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelSettings(conn);
      const [rows]: any = await conn.query(
        `SELECT white_label_trial_days, white_label_daily_reveals,
                white_label_monthly_price_gbp, white_label_yearly_price_gbp,
                white_label_monthly_price_cad, white_label_yearly_price_cad
         FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      const row = rows?.[0] || {};
      return NextResponse.json({
        ok: true,
        trial_days: Number(row.white_label_trial_days || 0),
        daily_reveals: Number(row.white_label_daily_reveals || 0),
        monthly_price_gbp: row.white_label_monthly_price_gbp,
        yearly_price_gbp: row.white_label_yearly_price_gbp,
        monthly_price_cad: row.white_label_monthly_price_cad,
        yearly_price_cad: row.white_label_yearly_price_cad,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
