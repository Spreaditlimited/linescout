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
  const cookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "linescout_admin_session").trim();
  const hdrs = await headers();
  const cookieHeader = hdrs.get("cookie") || "";
  const appHeader = String(hdrs.get("x-linescout-app") || "").toLowerCase();
  const referer = String(hdrs.get("referer") || "");
  const isAgentApp = appHeader === "agent" || referer.includes("/agent-app");

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
    const [modeCols]: any = await conn.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_settings'
        AND column_name = 'agent_otp_mode'
      LIMIT 1
      `
    );
    let otpMode: "phone" | "email" = "phone";
    if (modeCols?.length) {
      const [modeRows]: any = await conn.query(
        `SELECT agent_otp_mode FROM linescout_settings ORDER BY id DESC LIMIT 1`
      );
      otpMode = String(modeRows?.[0]?.agent_otp_mode || "phone").toLowerCase() === "email" ? "email" : "phone";
    }

    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
         u.role,
         u.is_active,
         u.email,
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
    const role = String(r.role || "").toLowerCase();

    if (isAgentApp && role !== "agent") {
      return NextResponse.json({ ok: false, error: "Agent access only" }, { status: 403 });
    }

    if (!r.is_active) {
      return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });
    }

    // Durable phone verification logic:
    // - Admins bypass OTP entirely (always treated as verified for routing purposes)
    // - Agents are "verified" if ANY OTP has been successfully used (used_at IS NOT NULL)
    let phone = "";
    let phone_verified = r.role === "admin" ? true : false;
    let email_verified = r.role === "admin" ? true : false;
    let otp_verified = r.role === "admin" ? true : false;

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
      const [emailTable]: any = await conn.query(
        `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'internal_agent_email_otps'
        LIMIT 1
        `
      );
      if (emailTable?.length) {
        const [usedEmailRows]: any = await conn.query(
          `SELECT id
           FROM internal_agent_email_otps
           WHERE user_id = ?
             AND used_at IS NOT NULL
           LIMIT 1`,
          [r.id]
        );
        email_verified = !!usedEmailRows?.length;
      } else {
        email_verified = false;
      }

      const [usedOtpRows]: any = await conn.query(
        `SELECT id
         FROM internal_agent_phone_otps
         WHERE user_id = ?
           AND used_at IS NOT NULL
         LIMIT 1`,
        [r.id]
      );
      phone_verified = !!usedOtpRows?.length;

      if (!phone_verified) {
        const [profileRows]: any = await conn.query(
          `SELECT china_phone_verified_at
           FROM linescout_agent_profiles
           WHERE internal_user_id = ?
           LIMIT 1`,
          [r.id]
        );
        phone_verified = !!profileRows?.[0]?.china_phone_verified_at;
      }

      otp_verified = otpMode === "email" ? email_verified : phone_verified;
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        role: r.role,
        email: r.email || "",
        phone,
        phone_verified,
        email_verified,
        otp_mode: otpMode,
        otp_verified,
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
