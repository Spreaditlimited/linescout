import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";
import { buildOtpEmail } from "@/lib/otp-email";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM || "no-reply@sureimports.com").trim();

  if (!host || !port || !user || !pass) {
    return { ok: false as const, error: "Missing SMTP env vars (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)." };
  }

  return { ok: true as const, host, port, user, pass, from };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const bankCode = clean(body?.bank_code);
    const accountNumber = clean(body?.account_number);

    if (!bankCode) {
      return NextResponse.json({ ok: false, error: "bank_code is required" }, { status: 400 });
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ ok: false, error: "account_number must be 10 digits" }, { status: 400 });
    }

    const smtp = getSmtpConfig();
    if (!smtp.ok) return NextResponse.json({ ok: false, error: smtp.error }, { status: 500 });

    const conn = await db.getConnection();
    try {
      const [recentRows]: any = await conn.query(
        `SELECT created_at
         FROM linescout_payout_account_otps
         WHERE owner_type = 'user' AND owner_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [user.id]
      );
      const recentAt = recentRows?.[0]?.created_at ? new Date(recentRows[0].created_at).getTime() : 0;
      if (recentAt && Date.now() - recentAt < 60_000) {
        return NextResponse.json(
          { ok: false, error: "Please wait a minute before requesting another code." },
          { status: 429 }
        );
      }

      const otp = makeOtp();
      const salt = crypto.randomBytes(8).toString("hex");
      const otpHash = hashOtp(otp, salt);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await conn.query(
        `INSERT INTO linescout_payout_account_otps
          (owner_type, owner_id, email, bank_code, account_number, otp_hash, otp_salt, expires_at)
         VALUES ('user', ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.email, bankCode, accountNumber, otpHash, salt, expiresAt]
      );

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });

      const mail = buildOtpEmail({ otp });

      await transporter.sendMail({
        from: smtp.from,
        to: user.email,
        replyTo: "hello@sureimports.com",
        subject: "Confirm payout bank change",
        text: mail.text,
        html: mail.html,
      });

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = String(e?.message || "Failed to send OTP");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
