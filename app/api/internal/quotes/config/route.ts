import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        u.username,
        u.role,
        u.is_active,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    const canView = role === "admin" ? true : !!rows[0].can_view_handoffs;

    if (!canView) {
      const isAgent = role === "agent";
      return {
        ok: false as const,
        status: 403 as const,
        error: isAgent ? "You need to be approved to use this feature." : "Forbidden",
        code: isAgent ? "AGENT_NOT_APPROVED" : "FORBIDDEN",
      };
    }

    return {
      ok: true as const,
      user: {
        id: Number(rows[0].id),
        username: String(rows[0].username || ""),
        role: role as "admin" | "agent",
      },
    };
  } finally {
    conn.release();
  }
}

async function ensureSettings(conn: any) {
  const [rows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  if (rows?.length) return rows[0];

  await conn.query(
    `INSERT INTO linescout_settings
     (commitment_due_ngn, agent_percent, agent_commitment_percent, markup_percent, exchange_rate_usd, exchange_rate_rmb)
     VALUES (0, 5, 40, 20, 0, 0)`
  );

  const [after]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  return after?.[0] || null;
}

export async function GET() {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    const settings = await ensureSettings(conn);
    const [types]: any = await conn.query(
      `SELECT id, name, is_active
       FROM linescout_shipping_types
       WHERE is_active = 1
       ORDER BY id DESC`
    );
    const [rates]: any = await conn.query(
      `SELECT r.id, r.shipping_type_id, r.rate_value, r.rate_unit, r.currency, r.is_active,
              t.name AS shipping_type_name
       FROM linescout_shipping_rates r
       JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
       WHERE r.is_active = 1
       ORDER BY r.id DESC`
    );

    return NextResponse.json({
      ok: true,
      settings: settings || null,
      shipping_types: types || [],
      shipping_rates: rates || [],
    });
  } finally {
    conn.release();
  }
}
