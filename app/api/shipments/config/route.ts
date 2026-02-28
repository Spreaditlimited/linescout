import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureCountryConfig, ensureShippingRateCountryColumn } from "@/lib/country-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let userId = 0;
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureShippingRateCountryColumn(conn);

    const [countries]: any = await conn.query(
      `SELECT id, name, iso2, iso3, default_currency_id, settlement_currency_code, payment_provider
       FROM linescout_countries
       WHERE is_active = 1
       ORDER BY name ASC`
    );

    const [rates]: any = await conn.query(
      `SELECT r.id, r.shipping_type_id, r.rate_value, r.rate_unit, r.currency, r.country_id,
              t.name AS shipping_type_name
       FROM linescout_shipping_rates r
       JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
       WHERE r.is_active = 1
       ORDER BY r.id DESC`
    );

    const [fxRates]: any = await conn.query(
      `SELECT base_currency_code, quote_currency_code, rate, effective_at, created_at
       FROM linescout_fx_rates
       ORDER BY effective_at DESC, id DESC`
    );

    const [userRows]: any = await conn.query(
      `
      SELECT c.id AS country_id, c.iso2 AS country_iso2, cur.code AS display_currency_code, c.payment_provider
      FROM users u
      LEFT JOIN linescout_countries c ON c.id = u.country_id
      LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
      WHERE u.id = ?
      LIMIT 1
      `,
      [userId]
    );
    const profile = userRows?.[0] || {};

    return NextResponse.json({
      ok: true,
      countries: countries || [],
      shipping_rates: rates || [],
      fx_rates: fxRates || [],
      profile: {
        country_id: profile.country_id || null,
        country_iso2: profile.country_iso2 || "",
        display_currency_code: profile.display_currency_code || "",
        payment_provider: profile.payment_provider || "",
      },
    });
  } finally {
    conn.release();
  }
}
