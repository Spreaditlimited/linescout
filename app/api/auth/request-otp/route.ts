// app/api/auth/request-otp/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { buildOtpEmail } from "@/lib/otp-email";
import { findReviewerByEmail } from "@/lib/reviewer-accounts";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateOtp() {
  // 6 digits, leading zeros preserved
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

function getClientIp(req: Request) {
  // Behind proxies, Vercel, etc.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

async function getDb() {
  return db.getConnection();
}

function getSmtp() {
  const SMTP_HOST = process.env.SMTP_HOST?.trim();
  const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
  const SMTP_USER = process.env.SMTP_USER?.trim();
  const SMTP_PASS = process.env.SMTP_PASS?.trim();

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return {
      ok: false as const,
      error: "SMTP not configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)",
    };
  }

  // IMPORTANT:
  // Hostinger requires the FROM address to be a mailbox you own, typically the same as SMTP_USER.
  // If SMTP_FROM is not set, default to SMTP_USER.
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

export async function POST(req: Request) {
  let conn: PoolConnection | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "");
    const email = normalizeEmail(emailRaw);

    if (!email || !email.includes("@") || email.length > 255) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent");
    const ip = getClientIp(req);

    conn = await getDb();

    // 1) Create or fetch user
    const [existing] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email_normalized = ? LIMIT 1",
      [email]
    );

    let userId: number;

    if (existing.length) {
      userId = Number(existing[0].id);
    } else {
      const [ins] = await conn.execute<ResultSetHeader>(
        "INSERT INTO users (email, email_normalized) VALUES (?, ?)",
        [emailRaw.trim(), email]
      );
      userId = Number(ins.insertId);
    }

    // Reviewer bypass (no email/OTP send)
    const reviewer = await findReviewerByEmail(conn, "mobile", email);
    if (reviewer) {
      const fixedOtp = String(reviewer.fixed_otp || "").trim();
      if (!/^\d{6}$/.test(fixedOtp)) {
        return NextResponse.json(
          { ok: false, error: "Reviewer OTP not configured. Contact support." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        reviewer: true,
        dev_otp: fixedOtp,
      });
    }

    // 2) Basic rate limit: max 3 OTPs per 15 minutes per user
    const [recent] = await conn.execute<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS cnt
      FROM email_otps
      WHERE user_id = ?
        AND created_at >= (NOW() - INTERVAL 15 MINUTE)
      `,
      [userId]
    );

    const cnt = Number(recent[0]?.cnt || 0);
    if (cnt >= 3) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    // 3) Create OTP record (store hashed OTP in DB for safety)
    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await conn.execute(
      `
      INSERT INTO email_otps (user_id, otp_code, expires_at, request_ip, user_agent)
      VALUES (?, ?, (NOW() + INTERVAL 10 MINUTE), ?, ?)
      `,
      [userId, otpHash, ip, userAgent]
    );

    // 4) Send OTP email via SMTP
    const smtp = getSmtp();
    if (!smtp.ok) {
      console.error(smtp.error);
      return NextResponse.json({ ok: false, error: "OTP email is not configured." }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const mail = buildOtpEmail({ otp });

    await transporter.sendMail({
      from: smtp.from,
      to: email,
      replyTo: "hello@sureimports.com",
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
