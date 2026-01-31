// app/api/internal/agents/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value || "";
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
  const auth = await requireInternalAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, username, role, is_active, created_at
       FROM internal_users
       WHERE role IN ('admin','agent')
       ORDER BY id ASC`
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}