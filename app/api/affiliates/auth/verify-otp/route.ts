import { NextResponse } from "next/server";
import type { PoolConnection } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  createAffiliate,
  ensureAffiliateSettingsColumns,
  ensureAffiliateTables,
  normalizeEmail,
  randomToken,
  resolveCountryCurrency,
  sha256,
} from "@/lib/affiliates";
import { ensureCountryConfig } from "@/lib/country-config";

function getClientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

async function ensureAffiliateEnabled(conn: PoolConnection) {
  await ensureAffiliateSettingsColumns(conn);
  const [rows]: any = await conn.query(
    `SELECT affiliate_enabled FROM linescout_settings ORDER BY id DESC LIMIT 1`
  );
  return Number(rows?.[0]?.affiliate_enabled || 0) === 1;
}

export async function POST(req: Request) {
  let conn: PoolConnection | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "");
    const email = normalizeEmail(emailRaw);
    const otpRaw = String(body?.otp || "").trim();
    const name = String(body?.name || "").trim();
    const countryId = body?.country_id ? Number(body.country_id) : null;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otpRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 400 });
    }

    conn = await db.getConnection();
    await ensureAffiliateTables(conn);
    await ensureCountryConfig(conn);

    const enabled = await ensureAffiliateEnabled(conn);
    if (!enabled) {
      return NextResponse.json({ ok: false, error: "Affiliate program is not active" }, { status: 403 });
    }

    const otpHash = sha256(otpRaw);

    const [otpRows]: any = await conn.query(
      `
      SELECT id, affiliate_id
      FROM linescout_affiliate_login_otps
      WHERE email_normalized = ?
        AND otp_code = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [email, otpHash]
    );

    if (!otpRows?.length) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
    }

    const otpId = Number(otpRows[0].id || 0);

    let affiliateId = Number(otpRows[0].affiliate_id || 0);
    if (!affiliateId) {
      if (!name) {
        return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
      }
      if (!countryId) {
        return NextResponse.json({ ok: false, error: "Country is required" }, { status: 400 });
      }

      const resolved = await resolveCountryCurrency(conn, countryId);
      if (!resolved?.currency_code) {
        return NextResponse.json({ ok: false, error: "Country currency not configured" }, { status: 400 });
      }

      const created = await createAffiliate(conn, {
        email: emailRaw.trim(),
        name,
        country_id: resolved.country_id,
        payout_currency: resolved.currency_code,
      });

      affiliateId = Number(created?.id || 0);
      if (!affiliateId) {
        return NextResponse.json({ ok: false, error: "Failed to create affiliate" }, { status: 500 });
      }
    }

    await conn.query(
      `UPDATE linescout_affiliate_login_otps SET used_at = NOW(), affiliate_id = ? WHERE id = ?`,
      [affiliateId, otpId]
    );

    const sessionToken = randomToken(32);
    const sessionHash = sha256(sessionToken);
    const userAgent = req.headers.get("user-agent");
    const ip = getClientIp(req);

    await conn.query(
      `
      INSERT INTO linescout_affiliate_sessions
        (affiliate_id, session_token_hash, expires_at, user_agent, ip_address, last_seen_at)
      VALUES
        (?, ?, (NOW() + INTERVAL 30 DAY), ?, ?, NOW())
      `,
      [affiliateId, sessionHash, userAgent, ip]
    );

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: "linescout_affiliate_session",
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    const msg = String(e?.message || "Server error");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

