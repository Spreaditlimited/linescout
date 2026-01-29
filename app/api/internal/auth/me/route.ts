import { NextResponse } from "next/server";
import { headers } from "next/headers";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function GET() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME!;
  const hdrs = headers(); // ❗ do NOT await
  const cookieHeader = hdrs.get("cookie") || "";

  const token =
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || null;

  // 🔴 LOG 1: raw cookie + extracted token
  console.log("AUTH_ME cookie header:", cookieHeader);
  console.log("AUTH_ME extracted token:", token);

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 }
    );
  }

  const conn = await pool.getConnection();
  try {
    // 🔴 LOG 2: recent sessions
    const [sessions]: any = await conn.query(
      `SELECT session_token, revoked_at
       FROM internal_sessions
       ORDER BY created_at DESC
       LIMIT 5`
    );

    console.log("AUTH_ME recent sessions:", sessions);

    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
         u.role,
         p.can_view_leads,
         p.can_view_handoffs
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      console.log("AUTH_ME lookup failed for token:", token);
      return NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    const r = rows[0];

    return NextResponse.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        role: r.role,
        permissions: {
          can_view_leads: !!r.can_view_leads,
          can_view_handoffs: !!r.can_view_handoffs,
        },
      },
    });
  } finally {
    conn.release();
  }
}