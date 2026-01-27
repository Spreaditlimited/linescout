// app/api/auth/request-otp/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import mysql from "mysql2/promise";

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
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("Missing DB env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)");
  }

  return mysql.createConnection({ host, user, password, database });
}

function getSmtp() {
  const SMTP_HOST = process.env.SMTP_HOST?.trim();
  const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
  const SMTP_USER = process.env.SMTP_USER?.trim();
  const SMTP_PASS = process.env.SMTP_PASS?.trim();
  // You said you use hello@sureimports.com
  const SMTP_FROM = (process.env.SMTP_FROM || "hello@sureimports.com").trim();

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return {
      ok: false as const,
      error: "SMTP not configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)",
    };
  }

  return {
    ok: true as const,
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM,
  };
}

function buildOtpEmail(params: { otp: string }) {
  const subject = "Your LineScout OTP Code";

  const text = [
    "LineScout (Sure Importers Limited)",
    "",
    `Your OTP is: ${params.otp}`,
    "",
    "This code expires in 10 minutes.",
    "If you did not request this, you can ignore this email.",
    "",
    "Help: hello@sureimports.com",
  ].join("\n");

  const html = `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:18px 22px;background:#0b0f17;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:13px;letter-spacing:0.4px;opacity:0.85;">LineScout (Sure Importers Limited)</div>
                <div style="font-size:18px;font-weight:700;margin-top:6px;line-height:1.35;">Your OTP Code</div>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 22px;color:#0b0f17;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#111827;">
                  Use the code below to sign in. This code expires in <b>10 minutes</b>.
                </p>

                <div style="border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#fafafa;text-align:center;margin:14px 0 18px 0;">
                  <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:#0b0f17;">${params.otp}</div>
                </div>

                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                  If you did not request this, you can ignore this email.
                </p>

                <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:#111827;">Need help?</div>
                  <div>Email: <a href="mailto:hello@sureimports.com" style="color:#0b0f17;text-decoration:underline;">hello@sureimports.com</a></div>
                </div>
              </td>
            </tr>
          </table>

          <div style="width:600px;max-width:600px;margin-top:10px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:left;padding:0 4px;">
            This email was sent because an OTP was requested for your LineScout account.
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;

  return { subject, text, html };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "");
    const email = normalizeEmail(emailRaw);

    if (!email || !email.includes("@") || email.length > 255) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent");
    const ip = getClientIp(req);

    const conn = await getDb();

    // 1) Create or fetch user
    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM users WHERE email_normalized = ? LIMIT 1",
      [email]
    );

    let userId: number;

    if (existing.length) {
      userId = Number(existing[0].id);
    } else {
      const [ins] = await conn.execute<mysql.ResultSetHeader>(
        "INSERT INTO users (email, email_normalized) VALUES (?, ?)",
        [emailRaw.trim(), email]
      );
      userId = Number(ins.insertId);
    }

    // 2) Basic rate limit: max 3 OTPs per 15 minutes per user
    const [recent] = await conn.execute<mysql.RowDataPacket[]>(
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
      await conn.end();
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

    await conn.end();

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
  }
}