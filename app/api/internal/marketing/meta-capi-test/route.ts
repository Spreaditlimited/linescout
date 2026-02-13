import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sendMetaLeadEvent } from "@/lib/meta-capi";

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

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim();
  const firstName = String(body?.first_name || "").trim();
  const lastName = String(body?.last_name || "").trim();
  const fbclid = String(body?.fbclid || "").trim();
  const fbc = String(body?.fbc || "").trim();
  const fbp = String(body?.fbp || "").trim();

  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  }

  const ip =
    String(req.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim() || null;
  const ua = String(req.headers.get("user-agent") || "").trim() || null;
  const eventSourceUrl =
    String(req.headers.get("referer") || "").trim() ||
    String(req.headers.get("origin") || "").trim() ||
    null;

  const result = await sendMetaLeadEvent({
    email,
    firstName,
    lastName,
    fbclid: fbclid || null,
    fbc: fbc || null,
    fbp: fbp || null,
    clientIp: ip,
    userAgent: ua,
    eventSourceUrl,
  });

  return NextResponse.json(result);
}
