import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "paystack" | "providus";

function normalizeProvider(v: any): Provider | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "paystack" || s === "providus") return s;
  return null;
}

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, userId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT provider_default, allow_overrides, updated_at
       FROM linescout_payment_settings
       ORDER BY id DESC
       LIMIT 1`
    );

    const provider = normalizeProvider(rows?.[0]?.provider_default) || "paystack";
    const allowOverrides = rows?.[0]?.allow_overrides != null ? !!rows?.[0]?.allow_overrides : true;

    return NextResponse.json({
      ok: true,
      settings: {
        provider_default: provider,
        allow_overrides: allowOverrides,
        updated_at: rows?.[0]?.updated_at || null,
      },
    });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const provider = normalizeProvider(body?.provider_default);
  const allowOverrides = body?.allow_overrides;

  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider_default must be 'paystack' or 'providus'" }, { status: 400 });
  }

  const allow = allowOverrides === undefined ? true : !!allowOverrides;

  const conn = await db.getConnection();
  try {
    await conn.query(
      `INSERT INTO linescout_payment_settings (provider_default, allow_overrides, updated_by)
       VALUES (?, ?, ?)`,
      [provider, allow ? 1 : 0, auth.userId]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
