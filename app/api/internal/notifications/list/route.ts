import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAgent() {
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
  if (!token) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

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

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

    const role = String(rows[0].role || "");
    if (role !== "agent") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, id: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

function parseCursor(raw: string | null) {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function GET(req: Request) {
  const auth = await requireInternalAgent();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const cursor = parseCursor(url.searchParams.get("cursor"));
  const limitRaw = Number(url.searchParams.get("limit") || 30);
  const limit = Math.max(5, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30));

  const conn = await db.getConnection();
  try {
    const params: any[] = [auth.id];
    let where = `target = 'agent' AND agent_id = ?`;
    if (cursor) {
      where += " AND id < ?";
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `SELECT id, title, body, data_json, is_read, created_at
       FROM linescout_notifications
       WHERE ${where}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit]
    );

    const items = (rows || []).map((r: any) => {
      let data = null;
      try {
        data = r.data_json ? JSON.parse(r.data_json) : null;
      } catch {
        data = null;
      }
      return {
        id: Number(r.id),
        title: r.title,
        body: r.body,
        data,
        is_read: !!r.is_read,
        created_at: r.created_at,
      };
    });

    const nextCursor = items.length ? items[items.length - 1].id : 0;
    return NextResponse.json({ ok: true, items, next_cursor: nextCursor });
  } finally {
    conn.release();
  }
}
