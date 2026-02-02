import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
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
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
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

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const ownerType = String(url.searchParams.get("owner_type") || "").trim();

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const conn = await db.getConnection();
  try {
    const params: any[] = [];
    let where = "1=1";
    if (ownerType === "user" || ownerType === "agent") {
      where += " AND w.owner_type = ?";
      params.push(ownerType);
    }
    if (q) {
      where +=
        " AND (u.email LIKE ? OR u.display_name LIKE ? OR iu.username LIKE ? OR ap.email LIKE ? OR ap.first_name LIKE ? OR ap.last_name LIKE ?)";
      params.push(like, like, like, like, like, like);
    }

    const [rows]: any = await conn.query(
      `SELECT
         w.id AS wallet_id,
         w.owner_type,
         w.owner_id,
         w.currency,
         w.balance,
         w.updated_at,
         va.account_number,
         va.account_name,
         u.email AS user_email,
         u.display_name AS user_display_name,
         iu.username AS agent_username,
         ap.first_name AS agent_first_name,
         ap.last_name AS agent_last_name,
         ap.email AS agent_email
       FROM linescout_wallets w
       LEFT JOIN linescout_virtual_accounts va
         ON va.owner_type = w.owner_type
        AND va.owner_id = w.owner_id
        AND va.provider = 'providus'
       LEFT JOIN users u ON w.owner_type = 'user' AND u.id = w.owner_id
       LEFT JOIN internal_users iu ON w.owner_type = 'agent' AND iu.id = w.owner_id
       LEFT JOIN linescout_agent_profiles ap ON w.owner_type = 'agent' AND ap.internal_user_id = w.owner_id
       WHERE ${where}
       ORDER BY w.updated_at DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}
