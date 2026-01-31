import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

async function requireInternalSession() {
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
      SELECT
        u.id,
        u.role,
        u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const r = rows[0];
    if (!r.is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return {
      ok: true as const,
      userId: Number(r.id),
      role: String(r.role || ""),
    };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Agents only (admin can set later via internal tools if needed)
  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nin = clean(body?.nin);

  // Nigeria NIN is 11 digits. Keep it strict to prevent junk.
  if (!/^\d{11}$/.test(nin)) {
    return NextResponse.json({ ok: false, error: "NIN must be 11 digits" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    // Ensure profile exists
    await conn.query(
      `
      INSERT INTO linescout_agent_profiles
        (internal_user_id, first_name, last_name, email, china_phone, china_city, nationality, payout_status)
      SELECT
        u.id,
        COALESCE(u.first_name, ''),
        COALESCE(u.last_name, ''),
        COALESCE(u.email, ''),
        '',
        'pending',
        'Nigeria',
        'pending'
      FROM internal_users u
      WHERE u.id = ?
      ON DUPLICATE KEY UPDATE internal_user_id = internal_user_id
      `,
      [auth.userId]
    );

    // Save NIN, reset verification stamp (manual verification later)
    await conn.query(
      `
      UPDATE linescout_agent_profiles
      SET nin = ?, nin_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [nin, auth.userId]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}