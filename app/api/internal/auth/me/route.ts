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

  // ✅ headers() IS async in your Next version
  const hdrs = await headers();
  const cookieHeader = hdrs.get("cookie") || "";

  const token =
    cookieHeader
      .split(/[;,]/) // ✅ split on BOTH ';' and ',' because your cookie header has commas
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || null;

  // 🔴 LOG 1
  console.log("AUTH_ME cookie header:", cookieHeader);
  console.log("AUTH_ME extracted token:", token);

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
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const r = rows[0];

    if (!r.is_active) {
      return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });
    }

    // ✅ Phone verification: latest OTP record decides current phone + verified state
    const [otpRows]: any = await conn.query(
      `SELECT phone, used_at
       FROM internal_agent_phone_otps
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [r.id]
    );

    const phone = otpRows?.length ? String(otpRows[0].phone || "") : "";
    const phone_verified = otpRows?.length ? !!otpRows[0].used_at : false;

    return NextResponse.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        role: r.role,
        phone,
        phone_verified,
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