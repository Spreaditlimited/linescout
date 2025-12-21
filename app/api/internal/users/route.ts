import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

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
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
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

    if (!rows.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (rows[0].role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

// GET: list internal users + permissions (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
         u.role,
         u.is_active,
         u.created_at,
         COALESCE(p.can_view_leads, 0) AS can_view_leads,
         COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
       FROM internal_users u
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE u.role = 'agent'
       ORDER BY u.id DESC`
    );

    return NextResponse.json({ ok: true, items: rows });
  } finally {
    conn.release();
  }
}

// POST: create an agent (admin only)
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);

  const username = (body?.username ?? "").trim();
  const password = body?.password ?? "";
  const can_view_leads = !!body?.can_view_leads;
  const can_view_handoffs = body?.can_view_handoffs === false ? false : true;

  if (!username || username.length < 3) {
    return NextResponse.json({ ok: false, error: "Username too short" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const conn = await pool.getConnection();
  try {
    const [result]: any = await conn.query(
      `INSERT INTO internal_users (username, password_hash, role, is_active)
       VALUES (?, ?, 'agent', 1)`,
      [username, password_hash]
    );

    const userId = result.insertId;

    await conn.query(
      `INSERT INTO internal_user_permissions (user_id, can_view_leads, can_view_handoffs)
       VALUES (?, ?, ?)`,
      [userId, can_view_leads ? 1 : 0, can_view_handoffs ? 1 : 0]
    );

    return NextResponse.json({ ok: true, id: userId });
  } catch (e: any) {
    if (String(e?.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Username already exists" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to create user" }, { status: 500 });
  } finally {
    conn.release();
  }
}

// PATCH: toggle active (admin only)
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();

  if (action !== "toggle_active" && action !== "reset_password" && action !== "update_permissions") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    if (action === "reset_password") {
      const userId = Number(body?.userId || 0);
      const newPassword = String(body?.newPassword || "");

      if (!userId || newPassword.length < 8) {
        return NextResponse.json(
          { ok: false, error: "userId and newPassword (min 8 chars) are required" },
          { status: 400 }
        );
      }

      const password_hash = await bcrypt.hash(newPassword, 12);

      const [result]: any = await conn.query(
        `UPDATE internal_users SET password_hash = ? WHERE id = ?`,
        [password_hash, userId]
      );

      if (!result || result.affectedRows !== 1) {
        return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "update_permissions") {
  const userId = Number(body?.userId || 0);
  const can_view_leads = body?.can_view_leads ? 1 : 0;
  const can_view_handoffs = body?.can_view_handoffs ? 1 : 0;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
  }

  await conn.query(
    `INSERT INTO internal_user_permissions (user_id, can_view_leads, can_view_handoffs)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       can_view_leads = VALUES(can_view_leads),
       can_view_handoffs = VALUES(can_view_handoffs)`,
    [userId, can_view_leads, can_view_handoffs]
  );

  return NextResponse.json({ ok: true });
}

    // action === "toggle_active"
    const userId = Number(body?.userId || 0);
    const isActive = Number(body?.is_active);

    if (!userId || (isActive !== 0 && isActive !== 1)) {
      return NextResponse.json({ ok: false, error: "userId and is_active are required" }, { status: 400 });
    }

    if (userId === 1 && isActive === 0) {
      return NextResponse.json({ ok: false, error: "Cannot deactivate primary admin" }, { status: 400 });
    }

    const [result]: any = await conn.query(
      `UPDATE internal_users SET is_active = ? WHERE id = ?`,
      [isActive, userId]
    );

    if (!result || result.affectedRows !== 1) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}