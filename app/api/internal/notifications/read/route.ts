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

export async function POST(req: Request) {
  const auth = await requireInternalAgent();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids)
    ? body.ids.map((x: any) => Number(x)).filter((n: number) => n > 0)
    : [];
  const all = !!body?.all;

  if (!all && !ids.length) {
    return NextResponse.json({ ok: false, error: "ids or all is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    if (all) {
      await conn.query(
        `UPDATE linescout_notifications
         SET is_read = 1, read_at = NOW()
         WHERE target = 'agent' AND agent_id = ? AND is_read = 0`,
        [auth.id]
      );
    } else {
      await conn.query(
        `UPDATE linescout_notifications
         SET is_read = 1, read_at = NOW()
         WHERE target = 'agent' AND agent_id = ? AND id IN (?)`,
        [auth.id, ids]
      );
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
