import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureAffiliateTables, resolveCountryCurrency } from "@/lib/affiliates";
import { ensureCountryConfig } from "@/lib/country-config";

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

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const affiliateId = Number(id || 0);
  if (!affiliateId) return NextResponse.json({ ok: false, error: "Invalid affiliate id" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_affiliates WHERE id = ? LIMIT 1`,
      [affiliateId]
    );
    if (!rows?.length) return NextResponse.json({ ok: false, error: "Affiliate not found" }, { status: 404 });

    const [acctRows]: any = await conn.query(
      `SELECT provider, provider_account, status, verified_at, currency, country_id FROM linescout_affiliate_payout_accounts WHERE affiliate_id = ? LIMIT 1`,
      [affiliateId]
    );

    return NextResponse.json({ ok: true, affiliate: rows[0], payout_account: acctRows?.[0] || null });
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const affiliateId = Number(id || 0);
  if (!affiliateId) return NextResponse.json({ ok: false, error: "Invalid affiliate id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status ? String(body.status).trim() : null;
  const name = body?.name ? String(body.name).trim() : null;
  const countryId = body?.country_id ? Number(body.country_id) : null;

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await ensureCountryConfig(conn);

    let payoutCurrency: string | null = null;
    if (countryId) {
      const resolved = await resolveCountryCurrency(conn, countryId);
      if (!resolved?.currency_code) {
        return NextResponse.json({ ok: false, error: "Country currency not configured" }, { status: 400 });
      }
      payoutCurrency = resolved.currency_code;
    }

    await conn.query(
      `
      UPDATE linescout_affiliates
      SET
        name = COALESCE(?, name),
        status = COALESCE(?, status),
        country_id = COALESCE(?, country_id),
        payout_currency = COALESCE(?, payout_currency),
        updated_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [name, status, countryId, payoutCurrency, affiliateId]
    );

    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_affiliates WHERE id = ? LIMIT 1`,
      [affiliateId]
    );

    return NextResponse.json({ ok: true, affiliate: rows?.[0] || null });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to update affiliate");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}

