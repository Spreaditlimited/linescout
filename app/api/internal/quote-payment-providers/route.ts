import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  deleteQuotePaymentProvider,
  listQuotePaymentProviders,
  upsertQuotePaymentProvider,
} from "@/lib/quote-payment-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "global" | "paypal" | "paystack" | "providus";

function normalizeProvider(v: any): Provider | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "global" || s === "paypal" || s === "paystack" || s === "providus") return s;
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
    const countries = await listQuotePaymentProviders(conn);
    return NextResponse.json({ ok: true, countries });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const countryId = Number(body?.country_id || 0);
  const provider = normalizeProvider(body?.provider);
  if (!countryId || !provider) {
    return NextResponse.json({ ok: false, error: "Invalid country_id or provider" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    if (provider === "global") {
      await deleteQuotePaymentProvider(conn, countryId);
    } else {
      await upsertQuotePaymentProvider(conn, countryId, provider);
    }
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
