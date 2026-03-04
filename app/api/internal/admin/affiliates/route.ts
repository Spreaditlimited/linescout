import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createAffiliate, ensureAffiliateTables, resolveCountryCurrency } from "@/lib/affiliates";
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

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(10, Math.min(200, limitRaw));
  const cursor = Number(url.searchParams.get("cursor") || 0);

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);

    const params: any[] = [];
    let where = "1=1";
    if (q) {
      where += " AND (a.email LIKE ? OR a.name LIKE ? OR a.referral_code LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (cursor > 0) {
      where += " AND a.id < ?";
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `
      SELECT a.id, a.email, a.name, a.status, a.referral_code, a.country_id, a.payout_currency, a.created_at
      FROM linescout_affiliates a
      WHERE ${where}
      ORDER BY a.id DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    const nextCursor = rows?.length ? Number(rows[rows.length - 1].id) : null;
    return NextResponse.json({ ok: true, items: rows || [], next_cursor: nextCursor });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim();
  const name = String(body?.name || "").trim();
  const countryId = body?.country_id ? Number(body.country_id) : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  }
  if (!countryId) {
    return NextResponse.json({ ok: false, error: "Country is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureAffiliateTables(conn);
    await ensureCountryConfig(conn);

    const resolved = await resolveCountryCurrency(conn, countryId);
    if (!resolved?.currency_code) {
      return NextResponse.json({ ok: false, error: "Country currency not configured" }, { status: 400 });
    }

    const created = await createAffiliate(conn, {
      email,
      name,
      country_id: resolved.country_id,
      payout_currency: resolved.currency_code,
    });

    return NextResponse.json({ ok: true, affiliate: created });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to create affiliate");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}

