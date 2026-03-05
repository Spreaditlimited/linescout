import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureCountryConfig } from "@/lib/country-config";
import { ensureQuoteAddonTables } from "@/lib/quote-addons";

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

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureQuoteAddonTables(conn);
    const [countries]: any = await conn.query(
      `SELECT id, name, iso2, iso3, is_active
       FROM linescout_countries
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    const [rates]: any = await conn.query(
      `SELECT country_id, rate_percent, is_active
       FROM linescout_vat_rates`
    );
    return NextResponse.json({ ok: true, countries: countries || [], rates: rates || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const countryId = Number(body?.country_id || 0);
  const rate = Number(body?.rate_percent || 0);
  const isActive = body?.is_active === false ? 0 : 1;

  if (!countryId) {
    return NextResponse.json({ ok: false, error: "country_id is required" }, { status: 400 });
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ ok: false, error: "rate_percent must be 0 or more" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureQuoteAddonTables(conn);
    await conn.query(
      `INSERT INTO linescout_vat_rates (country_id, rate_percent, is_active)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rate_percent = VALUES(rate_percent), is_active = VALUES(is_active), updated_at = CURRENT_TIMESTAMP`,
      [countryId, rate, isActive]
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to save VAT rate");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
