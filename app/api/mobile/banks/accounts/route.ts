import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureCountryConfig, ensureUserCountryColumns, getNigeriaDefaults } from "@/lib/country-config";
import { ensureBankAccountCountryColumns } from "@/lib/bank-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/banks/accounts
 * - signed-in users only
 * - returns active official bank accounts matching the user's country and currency
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const conn = await db.getConnection();
    try {
      await ensureCountryConfig(conn);
      await ensureUserCountryColumns(conn);
      await ensureBankAccountCountryColumns(conn);
      const defaults = await getNigeriaDefaults(conn);
      const [userRows]: any = await conn.query(
        `SELECT
           COALESCE(u.country_id, ?) AS country_id,
           COALESCE(
             NULLIF(TRIM(u.display_currency_code), ''),
             NULLIF(TRIM(c.settlement_currency_code), ''),
             cur.code,
             'NGN'
           ) AS currency_code
         FROM users u
         LEFT JOIN linescout_countries c ON c.id = u.country_id
         LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
         WHERE u.id = ?
         LIMIT 1`,
        [defaults.country_id, user.id]
      );
      const countryId = Number(userRows?.[0]?.country_id || defaults.country_id || 0);
      const currencyCode = String(userRows?.[0]?.currency_code || "NGN").trim().toUpperCase();
      const [rows]: any = await conn.query(
        `
        SELECT
          a.id,
          a.purpose,
          a.account_name,
          a.account_number,
          a.currency_code,
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
        ORDER BY a.purpose ASC, b.name ASC, a.account_name ASC, a.id ASC
        `,
        [countryId, currencyCode]
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
