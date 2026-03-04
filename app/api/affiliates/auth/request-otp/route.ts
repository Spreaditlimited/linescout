import { NextResponse } from "next/server";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  buildAffiliateOtpEmail,
  ensureAffiliateSettingsColumns,
  ensureAffiliateTables,
  normalizeEmail,
  randomCode,
  sha256,
} from "@/lib/affiliates";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

function getSmtp() {
  const SMTP_HOST = process.env.SMTP_HOST?.trim();
  const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
  const SMTP_USER = process.env.SMTP_USER?.trim();
  const SMTP_PASS = process.env.SMTP_PASS?.trim();

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { ok: false as const, error: "SMTP not configured" };
  }

  const SMTP_FROM = (process.env.SMTP_FROM || SMTP_USER).trim();
  return {
    ok: true as const,
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM,
  };
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

    if (!email || !email.includes("@") || email.length > 255) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    conn = await db.getConnection();
    await ensureAffiliateTables(conn);

    const enabled = await ensureAffiliateEnabled(conn);
    if (!enabled) {
      return NextResponse.json({ ok: false, error: "Affiliate program is not active" }, { status: 403 });
    }

    const [aRows]: any = await conn.query(
      `SELECT id FROM linescout_affiliates WHERE email_normalized = ? LIMIT 1`,
      [email]
    );
    const affiliateId = aRows?.length ? Number(aRows[0].id || 0) : null;

    const [recent] = await conn.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS cnt
      FROM linescout_affiliate_login_otps
      WHERE email_normalized = ?
        AND created_at >= (NOW() - INTERVAL 15 MINUTE)
      `,
      [email]
    );

    const cnt = Number((recent as any)?.[0]?.cnt || 0);
    if (cnt >= 3) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const otp = randomCode(6);
    const otpHash = sha256(otp);

    await conn.query(
      `
      INSERT INTO linescout_affiliate_login_otps
        (affiliate_id, email, email_normalized, otp_code, expires_at)
      VALUES
        (?, ?, ?, ?, (NOW() + INTERVAL 10 MINUTE))
      `,
      [affiliateId || null, emailRaw.trim(), email, otpHash]
    );

    const smtp = getSmtp();
    if (!smtp.ok) {
      return NextResponse.json({ ok: false, error: "OTP email is not configured." }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const mail = await buildAffiliateOtpEmail(otp);

    await transporter.sendMail({
      from: smtp.from,
      to: emailRaw.trim(),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    return NextResponse.json({ ok: true, needs_profile: !affiliateId });
  } catch (e: any) {
    const msg = String(e?.message || "Server error");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

