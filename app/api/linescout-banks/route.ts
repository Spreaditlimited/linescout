// app/api/linescout-banks/route.ts
import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function requireAdmin() {
  const cookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "").trim();
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.role
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (String(rows[0].role || "") !== "admin") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

// GET: list banks (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, name, is_active
       FROM linescout_banks
       ORDER BY name ASC`
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

// POST: create bank (admin only)
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ ok: false, error: "Bank name too short" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const [result]: any = await conn.query(
      `INSERT INTO linescout_banks (name, is_active)
       VALUES (?, 1)`,
      [name]
    );

    return NextResponse.json({ ok: true, id: result?.insertId });
  } catch (e: any) {
    if (String(e?.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Bank already exists" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to create bank" }, { status: 500 });
  } finally {
    conn.release();
  }
}

// PATCH: toggle bank active (admin only)
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();

  if (action !== "toggle_active") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const id = Number(body?.id || 0);
  const is_active = Number(body?.is_active);

  if (!id || (is_active !== 0 && is_active !== 1)) {
    return NextResponse.json({ ok: false, error: "id and is_active are required" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const [result]: any = await conn.query(
      `UPDATE linescout_banks SET is_active = ? WHERE id = ?`,
      [is_active, id]
    );

    if (!result || result.affectedRows !== 1) {
      return NextResponse.json({ ok: false, error: "Bank not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}