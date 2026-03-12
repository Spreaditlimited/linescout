import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelSettings(conn);
      const [rows]: any = await conn.query(
        `SELECT s.white_label_trial_days, s.white_label_daily_reveals, s.white_label_insights_daily_limit,
                white_label_monthly_price_gbp, white_label_yearly_price_gbp,
                white_label_monthly_price_cad, white_label_yearly_price_cad,
                white_label_monthly_price_usd, white_label_yearly_price_usd,
                s.white_label_subscription_countries,
                u.display_currency_code, c.iso2, c.settlement_currency_code, c.amazon_enabled
         FROM users u
         LEFT JOIN linescout_countries c ON c.id = u.country_id
         CROSS JOIN (SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1) s
         WHERE u.id = ?
         LIMIT 1`,
        [Number((user as any)?.id || 0)]
      );
      const row = rows?.[0] || {};
      const toNum = (value: any) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const iso2Raw = String(row.iso2 || "").trim().toUpperCase();
      const iso2 = iso2Raw === "UK" ? "GB" : iso2Raw;
      const amazonEnabled = Number(row.amazon_enabled || 0) === 1;
      const allowedCountries = String(row.white_label_subscription_countries || "")
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean)
        .map((code) => (code === "UK" ? "GB" : code));
      const countryAllowed = !allowedCountries.length || (iso2 ? allowedCountries.includes(iso2) : false);
      const eligible = amazonEnabled && countryAllowed;
      const display = String(row.display_currency_code || row.settlement_currency_code || "").toUpperCase();
      const currency = display === "CAD" || iso2 === "CA" ? "CAD" : display === "USD" || iso2 === "US" ? "USD" : "GBP";
      const monthlyByCurrency =
        currency === "CAD"
          ? toNum(row.white_label_monthly_price_cad)
          : currency === "USD"
          ? toNum(row.white_label_monthly_price_usd)
          : toNum(row.white_label_monthly_price_gbp);
      const yearlyByCurrency =
        currency === "CAD"
          ? toNum(row.white_label_yearly_price_cad)
          : currency === "USD"
          ? toNum(row.white_label_yearly_price_usd)
          : toNum(row.white_label_yearly_price_gbp);
      return NextResponse.json({
        ok: true,
        trial_days: Number(row.white_label_trial_days || 0),
        daily_reveals: Number(row.white_label_daily_reveals || 0),
        daily_insights: Number(row.white_label_insights_daily_limit || 0),
        country_iso2: iso2 || null,
        amazon_enabled: amazonEnabled,
        subscription_eligible: eligible,
        currency,
        monthly_price: monthlyByCurrency,
        yearly_price: yearlyByCurrency,
        monthly_price_gbp: toNum(row.white_label_monthly_price_gbp),
        yearly_price_gbp: toNum(row.white_label_yearly_price_gbp),
        monthly_price_cad: toNum(row.white_label_monthly_price_cad),
        yearly_price_cad: toNum(row.white_label_yearly_price_cad),
        monthly_price_usd: toNum(row.white_label_monthly_price_usd),
        yearly_price_usd: toNum(row.white_label_yearly_price_usd),
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
