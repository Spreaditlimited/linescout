import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  // ✅ headers() is async in your Next version
  const h = await headers();

  // Support Bearer too (keep)
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  // ✅ Robust cookie parsing (same fix style as /auth/me)
  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;

  // (Optional debug if needed later)
  // console.log("PROFILE_ME cookie header:", cookieHeader);
  // console.log("PROFILE_ME extracted token:", token);

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.is_active,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const r = rows[0];
    if (!r.is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return {
      ok: true as const,
      userId: Number(r.id),
      username: String(r.username || ""),
      role: String(r.role || ""),
      can_view_handoffs: !!r.can_view_handoffs,
    };
  } finally {
    conn.release();
  }
}

export async function GET() {
  const auth = await requireInternalSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const conn = await db.getConnection();
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

    // Profile (canonical)
    const profile: any = await (async () => {
      const [rows]: any = await conn.query(
        `
        SELECT
          first_name,
          last_name,
          email,
          china_phone,
          ng_phone,
          china_phone_verified_at,
          china_city,
          nationality,
          nin,
          nin_verified_at,
          full_address,
          payout_status,
          email_notifications_enabled,
          approval_status
        FROM linescout_agent_profiles
        WHERE internal_user_id = ?
        LIMIT 1
        `,
        [auth.userId]
      );
      return rows?.length ? rows[0] : null;
    })();

    // Agent payout bank account (separate)
    const payout: any = await (async () => {
      const [rows]: any = await conn.query(
        `
        SELECT
          bank_code,
          account_number,
          account_name,
          status,
          verified_at
        FROM linescout_agent_payout_accounts
        WHERE internal_user_id = ?
        LIMIT 1
        `,
        [auth.userId]
      );
      return rows?.length ? rows[0] : null;
    })();

    const approvalStatus = String(profile?.approval_status || "").toLowerCase();
    let canViewHandoffs = auth.can_view_handoffs;

    if (auth.role === "agent" && approvalStatus === "approved" && !canViewHandoffs) {
      await conn.query(
        `
        INSERT INTO internal_user_permissions (user_id, can_view_handoffs, can_view_leads)
        VALUES (?, 1, 1)
        ON DUPLICATE KEY UPDATE
          can_view_handoffs = VALUES(can_view_handoffs),
          can_view_leads = VALUES(can_view_leads)
        `,
        [auth.userId]
      );
      canViewHandoffs = true;
    }

    const phoneVerified = !!profile?.china_phone_verified_at;
    let emailVerified = false;
    if (auth.role === "agent") {
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
          [auth.userId]
        );
        emailVerified = !!usedEmailRows?.length;
      }
    }
    const otpVerified = otpMode === "email" ? emailVerified : phoneVerified;
    const ninProvided = !!(profile?.nin && String(profile.nin).trim().length > 0);
    const ninVerified = !!profile?.nin_verified_at;
    const addressProvided = !!(profile?.full_address && String(profile.full_address).trim().length > 0);

    const bankProvided = !!(payout?.account_number && String(payout.account_number).trim().length > 0);
    const bankVerified = !!payout?.verified_at || String(payout?.status || "") === "verified";

    return NextResponse.json({
      ok: true,
      user: {
        id: auth.userId,
        username: auth.username,
        role: auth.role,
        can_view_handoffs: canViewHandoffs,
      },
      profile: profile
        ? {
            first_name: String(profile.first_name || ""),
            last_name: String(profile.last_name || ""),
            email: String(profile.email || ""),
            china_phone: String(profile.china_phone || ""),
            ng_phone: String(profile.ng_phone || ""),
            china_phone_verified_at: profile.china_phone_verified_at,
            china_city: String(profile.china_city || ""),
            nationality: String(profile.nationality || ""),
            nin: profile.nin ? String(profile.nin) : null,
            nin_verified_at: profile.nin_verified_at,
            full_address: profile.full_address ? String(profile.full_address) : null,
            payout_status: String(profile.payout_status || "pending"),
            approval_status: String(profile.approval_status || "pending"),
          }
        : null,
      payout_account: payout
        ? {
            bank_code: String(payout.bank_code || ""),
            account_number: String(payout.account_number || ""),
            account_name: payout.account_name ? String(payout.account_name) : null,
            status: String(payout.status || "pending"),
            verified_at: payout.verified_at,
          }
        : null,
      checklist: {
        phone_verified: phoneVerified,
        email_verified: emailVerified,
        otp_mode: otpMode,
        otp_verified: otpVerified,
        nin_provided: ninProvided,
        nin_verified: ninVerified,
        bank_provided: bankProvided,
        bank_verified: bankVerified,
        address_provided: addressProvided,
        approved_to_claim: auth.role === "admin" ? true : canViewHandoffs,
      },
    });
  } finally {
    conn.release();
  }
}
