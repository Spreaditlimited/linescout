import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Target = "agent" | "user";

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

function isTarget(x: any): x is Target {
  return x === "agent" || x === "user";
}

function splitName(full: string | null) {
  const s = String(full || "").trim().replace(/\s+/g, " ");
  if (!s) return { first_name: "", last_name: "" };
  const parts = s.split(" ");
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const target = url.searchParams.get("target");
  const q = String(url.searchParams.get("q") || "").trim();
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Math.max(5, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 20));

  if (!isTarget(target)) {
    return NextResponse.json({ ok: false, error: "target must be 'agent' or 'user'" }, { status: 400 });
  }

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const conn = await db.getConnection();
  try {
    if (target === "agent") {
      const params: any[] = [];
      let where = "iu.role = 'agent' AND iu.is_active = 1";
      if (q) {
        where += " AND (ap.first_name LIKE ? OR ap.last_name LIKE ? OR ap.email LIKE ? OR iu.username LIKE ?)";
        params.push(like, like, like, like);
      }

      const [rows]: any = await conn.query(
        `SELECT
           ap.internal_user_id AS id,
           iu.username,
           ap.email,
           ap.first_name,
           ap.last_name
         FROM linescout_agent_profiles ap
         JOIN internal_users iu ON iu.id = ap.internal_user_id
         WHERE ${where}
         ORDER BY ap.updated_at DESC
         LIMIT ?`,
        [...params, limit]
      );

      const items = (rows || []).map((r: any) => ({
        id: Number(r.id),
        username: r.username || null,
        email: r.email || null,
        first_name: r.first_name || "",
        last_name: r.last_name || "",
      }));

      return NextResponse.json({ ok: true, items });
    }

    const params: any[] = [];
    let where = "1=1";
    if (q) {
      where += " AND (u.email LIKE ? OR u.display_name LIKE ?)";
      params.push(like, like);
    }

    const [rows]: any = await conn.query(
      `SELECT u.id, u.email, u.display_name
       FROM users u
       WHERE ${where}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, limit]
    );

    const items = (rows || []).map((r: any) => {
      const name = splitName(r.display_name);
      return {
        id: Number(r.id),
        username: null,
        email: r.email || null,
        first_name: name.first_name,
        last_name: name.last_name,
      };
    });

    return NextResponse.json({ ok: true, items });
  } finally {
    conn.release();
  }
}
