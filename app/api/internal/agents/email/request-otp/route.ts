import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { buildOtpEmail } from "@/lib/otp-email";
import { findReviewerByEmail } from "@/lib/reviewer-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

function clean(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: any) {
  return clean(v).toLowerCase();
}

function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

async function ensureEmailOtpTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS internal_agent_email_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      attempts INT DEFAULT 0,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_email (email)
    )
    `
  );
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
  const body = await req.json().catch(() => ({}));
  const userId = Number(body?.user_id || 0);
  const emailInput = normalizeEmail(body?.email);

  if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureEmailOtpTable(conn);

    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active, COALESCE(ap.email, u.email) AS email
      FROM internal_users u
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows?.length) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    if (String(rows[0].role) !== "agent") return NextResponse.json({ ok: false, error: "Not an agent" }, { status: 403 });
    if (!rows[0].is_active) return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });

    const email = normalizeEmail(emailInput || rows[0].email || "");
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
    }

    if (emailInput && emailInput !== email) {
      return NextResponse.json({ ok: false, error: "Email does not match account" }, { status: 400 });
    }

    const reviewer = await findReviewerByEmail(conn, "agent", email);
    if (reviewer) {
      const fixedOtp = String(reviewer.fixed_otp || "").trim();
      if (!/^\d{6}$/.test(fixedOtp)) {
        return NextResponse.json({ ok: false, error: "Reviewer OTP not configured." }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        dev_otp: fixedOtp,
      });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = hashOtp(otp, salt);

    await conn.query(
      `
      INSERT INTO internal_agent_email_otps (user_id, email, otp_hash, expires_at)
      VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
      `,
      [userId, email, `${salt}:${otpHash}`]
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

    const mail = buildOtpEmail({ otp });

    await transporter.sendMail({
      from: smtp.from,
      to: email,
      replyTo: "hello@sureimports.com",
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    const revealOtp =
      process.env.NODE_ENV !== "production" ||
      String(process.env.REVEAL_AGENT_EMAIL_OTP || "") === "1";

    return NextResponse.json({
      ok: true,
      dev_otp: revealOtp ? otp : undefined,
    });
  } catch (e: any) {
    console.error("POST /api/internal/agents/email/request-otp error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to request OTP" }, { status: 500 });
  } finally {
    conn.release();
  }
}
