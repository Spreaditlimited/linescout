import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureCountryConfig } from "@/lib/country-config";
import { ensureQuoteAddonTables, listQuoteAddons } from "@/lib/quote-addons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

const VALID_ROUTE_TYPES = new Set(["machine_sourcing", "simple_sourcing", "white_label"]);

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    await ensureQuoteAddonTables(conn);
    await ensureCountryConfig(conn);
    const { addons, prices } = await listQuoteAddons(conn);
    const [currencies]: any = await conn.query(
      `SELECT id, code, symbol, decimal_places, display_format, is_active
       FROM linescout_currencies
       ORDER BY code ASC`
    );
    const [countries]: any = await conn.query(
      `SELECT id, name, iso2, is_active
       FROM linescout_countries
       ORDER BY name ASC`
    );
    return NextResponse.json({ ok: true, addons, prices, currencies: currencies || [], countries: countries || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const routeTypes = Array.isArray(body?.route_types) ? body.route_types : [];
  const isActive = body?.is_active === false ? 0 : 1;
  const prices = Array.isArray(body?.prices) ? body.prices : [];
  const addonId = body?.id ? Number(body.id) : 0;
  const countryIds = Array.isArray(body?.country_ids) ? body.country_ids : [];

  if (!title) {
    return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
  }

  const cleanedRoutes = routeTypes
    .map((r: any) => String(r || "").trim().toLowerCase())
    .filter((r: string) => VALID_ROUTE_TYPES.has(r));

  if (!cleanedRoutes.length) {
    return NextResponse.json({ ok: false, error: "Select at least one route type." }, { status: 400 });
  }

  const cleanedPrices = prices
    .map((p: any) => ({
      currency_code: String(p?.currency_code || "").trim().toUpperCase(),
      amount: Number(p?.amount || 0),
    }))
    .filter((p: any) => p.currency_code && Number.isFinite(p.amount) && p.amount >= 0);

  if (!cleanedPrices.length) {
    return NextResponse.json({ ok: false, error: "Provide at least one price." }, { status: 400 });
  }

  const cleanedCountries = countryIds
    .map((c: any) => Number(c))
    .filter((c: number) => Number.isFinite(c) && c > 0);

  const conn = await db.getConnection();
  try {
    await ensureQuoteAddonTables(conn);
    let id = addonId;

    if (id) {
      await conn.query(
        `UPDATE linescout_quote_addons
         SET title = ?, route_types_json = ?, country_ids_json = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, JSON.stringify(cleanedRoutes), JSON.stringify(cleanedCountries), isActive, id]
      );
    } else {
      const [res]: any = await conn.query(
        `INSERT INTO linescout_quote_addons (title, route_types_json, country_ids_json, is_active)
         VALUES (?, ?, ?, ?)`,
        [title, JSON.stringify(cleanedRoutes), JSON.stringify(cleanedCountries), isActive]
      );
      id = Number(res.insertId || 0);
    }

    if (id && cleanedPrices.length) {
      for (const price of cleanedPrices) {
        await conn.query(
          `INSERT INTO linescout_quote_addon_prices (addon_id, currency_code, amount)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_at = CURRENT_TIMESTAMP`,
          [id, price.currency_code, price.amount]
        );
      }
    }

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to save add-on");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
