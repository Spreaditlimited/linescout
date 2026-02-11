import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeChinaPhone(value: string) {
  const raw = String(value || "").trim().replace(/[\s-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+86")) return raw;
  if (raw.startsWith("86")) return `+${raw}`;
  return raw;
}

function isValidChinaMobile(value: string) {
  return /^\+86(1[3-9]\d{9})$/.test(value);
}

function clean(v: any) {
  return String(v ?? "").trim();
}

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();

  // Accept either Authorization: Bearer <token> OR Cookie header
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

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/admin/agents?limit=50&cursor=0&q=
 * Lists agents + profile + payout status + handoff permission + checklist.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(10, Math.min(200, limitRaw));
  const cursor = Number(url.searchParams.get("cursor") || 0);
  const q = clean(url.searchParams.get("q") || "").toLowerCase();

  const conn = await db.getConnection();
  try {
    const params: any[] = [];

    let where = `u.role = 'agent'`;

    if (q) {
      where += ` AND (
        u.username LIKE ?
        OR ap.email LIKE ?
        OR ap.first_name LIKE ?
        OR ap.last_name LIKE ?
        OR ap.china_phone LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    if (cursor > 0) {
      where += ` AND u.id > ?`;
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `
      SELECT
        u.id AS internal_user_id,
        u.username,
        u.is_active,
        u.created_at,

        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs,

        ap.first_name,
        ap.last_name,
        ap.email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,
        ap.nin,
        ap.nin_verified_at,
        ap.full_address,
        ap.payout_status,

        pa.bank_code,
        pa.account_number,
        pa.account_name,
        pa.status AS bank_status,
        pa.verified_at AS bank_verified_at

      FROM internal_users u
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      LEFT JOIN linescout_agent_payout_accounts pa ON pa.internal_user_id = u.id

      WHERE ${where}
      ORDER BY u.id ASC
      LIMIT ?
      `,
      [...params, limit]
    );

    const items = (rows || []).map((r: any) => {
      const phoneVerified =
        !!r.china_phone_verified_at ||
        isValidChinaMobile(normalizeChinaPhone(r.china_phone || ""));
      const ninProvided = !!(r.nin && String(r.nin).trim().length > 0);
      const ninVerified = !!r.nin_verified_at;
      const addressProvided = !!(r.full_address && String(r.full_address).trim().length > 0);

      const bankProvided = !!(r.account_number && String(r.account_number).trim().length > 0);
      const bankVerified = !!r.bank_verified_at || String(r.bank_status || "") === "verified";

      const approvedToClaim = !!r.can_view_handoffs;

      return {
        internal_user_id: Number(r.internal_user_id),
        username: String(r.username || ""),
        is_active: !!r.is_active,
        created_at: r.created_at,

        can_view_handoffs: !!r.can_view_handoffs,

        profile: {
          first_name: r.first_name ? String(r.first_name) : null,
          last_name: r.last_name ? String(r.last_name) : null,
          email: r.email ? String(r.email) : null,
          china_phone: r.china_phone ? String(r.china_phone) : null,
          china_phone_verified_at: r.china_phone_verified_at,
          china_city: r.china_city ? String(r.china_city) : null,
          nationality: r.nationality ? String(r.nationality) : null,
          nin: r.nin ? String(r.nin) : null,
          nin_verified_at: r.nin_verified_at,
          full_address: r.full_address ? String(r.full_address) : null,
          payout_status: r.payout_status ? String(r.payout_status) : "pending",
        },

        payout_account: r.account_number
          ? {
              bank_code: r.bank_code ? String(r.bank_code) : null,
              account_number: String(r.account_number || ""),
              account_name: r.account_name ? String(r.account_name) : null,
              status: r.bank_status ? String(r.bank_status) : "pending",
              verified_at: r.bank_verified_at,
            }
          : null,

        checklist: {
          phone_verified: phoneVerified,
          nin_provided: ninProvided,
          nin_verified: ninVerified,
          bank_provided: bankProvided,
          bank_verified: bankVerified,
          address_provided: addressProvided,
          approved_to_claim: approvedToClaim,
        },
      };
    });

    const nextCursor = items.length ? items[items.length - 1].internal_user_id : null;

    return NextResponse.json({ ok: true, items, next_cursor: nextCursor });
  } finally {
    conn.release();
  }
}
