// app/api/internal/auth/me/route.ts
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
  const hdrs = await headers();
  const cookieHeader = hdrs.get("cookie") || "";

  const token =
    cookieHeader
      .split(/[;,]/) // split on BOTH ';' and ','
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || null;

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

    if (!rows?.length) {
      console.log("AUTH_ME lookup failed for token:", token);
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const r = rows[0];

    if (!r.is_active) {
      return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });
    }

    // Durable phone verification logic:
    // - Admins bypass OTP entirely (always treated as verified for routing purposes)
    // - Agents are "verified" if ANY OTP has been successfully used (used_at IS NOT NULL)
    let phone = "";
    let phone_verified = r.role === "admin" ? true : false;

    // Pull latest phone (if any) so UI can display it.
    const [latestOtpRows]: any = await conn.query(
      `SELECT phone
       FROM internal_agent_phone_otps
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [r.id]
    );

    if (latestOtpRows?.length) {
      phone = String(latestOtpRows[0].phone || "");
    }

    // For agents, verification is durable: existence of any used OTP record
    if (r.role === "agent") {
      const [usedOtpRows]: any = await conn.query(
        `SELECT id
         FROM internal_agent_phone_otps
         WHERE user_id = ?
           AND used_at IS NOT NULL
         LIMIT 1`,
        [r.id]
      );
      phone_verified = !!usedOtpRows?.length;
    }

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