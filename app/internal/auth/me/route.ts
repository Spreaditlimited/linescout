// app/internal/auth/me/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function GET() {
  const cookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "linescout_admin_session").trim();
  if (!cookieName) {
    return NextResponse.json(
      { ok: false, error: "Missing INTERNAL_AUTH_COOKIE_NAME" },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
         u.role,
         u.is_active,
         COALESCE(p.can_view_leads, 0) AS can_view_leads,
         COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs,
         COALESCE(p.can_view_analytics, 0) AS can_view_analytics
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const r = rows[0];
    if (String(r.role || "").toLowerCase() !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access only" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: Number(r.id),
        username: String(r.username || ""),
        role: String(r.role || ""),
        permissions: {
          can_view_leads: !!r.can_view_leads,
          can_view_handoffs: !!r.can_view_handoffs,
          can_view_analytics: !!r.can_view_analytics,
        },
      },
    });
  } finally {
    conn.release();
  }
}
