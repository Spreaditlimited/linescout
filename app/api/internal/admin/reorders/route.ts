import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";

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
      `SELECT u.id, u.username, u.role, u.is_active
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

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "").trim();
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();

  const conn = await db.getConnection();
  try {
    await ensureReordersTable(conn);

    const clauses: string[] = [];
    const params: any[] = [];

    if (status) {
      clauses.push("r.status = ?");
      params.push(status);
    }

    if (q) {
      clauses.push(
        "(LOWER(u.email) LIKE ? OR LOWER(ap.email) LIKE ? OR CAST(r.conversation_id AS CHAR) LIKE ?)"
      );
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT
        r.*,
        u.email AS user_email,
        ap.email AS assigned_agent_email,
        iu.username AS assigned_agent_username,
        ou.username AS original_agent_username
      FROM linescout_reorder_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN internal_users iu ON iu.id = r.assigned_agent_id
      LEFT JOIN internal_users ou ON ou.id = r.original_agent_id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = r.assigned_agent_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}
