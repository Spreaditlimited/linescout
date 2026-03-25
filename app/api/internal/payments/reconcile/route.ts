import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { findPaymentAttempt } from "@/lib/payment-attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function internalSecret() {
  return (process.env.CRON_SECRET || process.env.PAYMENT_RECONCILE_SECRET || "").trim();
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "").trim().toLowerCase();
  const reference = String(body?.reference || "").trim();

  if (!reference || (provider !== "paystack" && provider !== "paypal")) {
    return NextResponse.json({ ok: false, error: "provider and reference are required" }, { status: 400 });
  }

  const secret = internalSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET or PAYMENT_RECONCILE_SECRET" }, { status: 500 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  if (provider === "paypal") {
    const conn = await db.getConnection();
    try {
      const attempt = await findPaymentAttempt(conn as any, "paypal", reference);
      if (!attempt) {
        return NextResponse.json({ ok: false, error: "No paypal attempt found for reference" }, { status: 404 });
      }
    } finally {
      conn.release();
    }
  }

  const endpoint =
    provider === "paystack" ? "/api/payments/paystack/verify" : "/api/payments/paypal/verify";
  const payload =
    provider === "paystack"
      ? { reference, purpose: body?.purpose || "sourcing", force_notify: true }
      : { order_id: reference, force_notify: true };

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
  return NextResponse.json({ ok: res.ok && json?.ok !== false, response: json }, { status: res.status });
}
