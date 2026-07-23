import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureCountryConfig, getNigeriaDefaults } from "@/lib/country-config";
import { ensureBankAccountCountryColumns } from "@/lib/bank-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestedCountryId = Number(url.searchParams.get("country_id") || 0);
  const requestedCurrency = String(url.searchParams.get("currency") || "").trim().toUpperCase();

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureBankAccountCountryColumns(conn);
    const defaults = await getNigeriaDefaults(conn);
    const countryId = requestedCountryId || defaults.country_id;
    const currencyCode = requestedCurrency || (countryId === defaults.country_id ? "NGN" : "");
    if (!countryId || !currencyCode) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const [rows]: any = await conn.query(
      `SELECT
         a.id,
         a.bank_id,
         a.country_id,
         a.currency_code,
         a.purpose,
         a.account_name,
         a.account_number,
         a.sort_code,
         a.iban,
         a.swift_bic,
         b.name AS bank_name
       FROM linescout_bank_accounts a
       JOIN linescout_banks b ON b.id = a.bank_id
       WHERE a.is_active = 1
         AND b.is_active = 1
         AND a.country_id = ?
         AND UPPER(a.currency_code) = ?
       ORDER BY b.name ASC, a.account_name ASC, a.id ASC`,
      [countryId, currencyCode]
    );
    return NextResponse.json({
      ok: true,
      items: (rows || []).map((r: any) => ({
        id: Number(r.id),
        bank_id: Number(r.bank_id || 0),
        country_id: Number(r.country_id || 0),
        currency_code: String(r.currency_code || "").trim().toUpperCase(),
        bank_name: String(r.bank_name || "").trim(),
        account_name: String(r.account_name || "").trim(),
        account_number: String(r.account_number || "").trim(),
        sort_code: String(r.sort_code || "").trim(),
        iban: String(r.iban || "").trim(),
        swift_bic: String(r.swift_bic || "").trim(),
        purpose: String(r.purpose || "").trim(),
      })),
    });
  } finally {
    conn.release();
  }
}
