import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildNoticeEmail } from "@/lib/otp-email";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Transporter } from "nodemailer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: string) {
  return clean(v).toLowerCase();
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

async function sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
  const smtp = getSmtpConfig();
  if (!smtp.ok) return { ok: false as const, error: smtp.error };

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { ok: true as const };
}

function buildResetEmail(params: { tempPassword: string }) {
  return buildNoticeEmail({
    subject: "LineScout Agent Password Reset",
    title: "Password reset",
    lines: [
      "Your LineScout Agent password has been reset.",
      `Temporary password: ${params.tempPassword}`,
      "Please sign in and change your password immediately.",
      "If you did not request this, contact support immediately.",
    ],
    footerNote: "This email was sent because a password reset was requested for your LineScout Agent account.",
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const loginRaw = clean(body?.login || body?.email || body?.username);
  if (!loginRaw || loginRaw.length < 3) {
    return NextResponse.json({ ok: false, error: "Login is required" }, { status: 400 });
  }

  const login = normalizeEmail(loginRaw);

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.username, u.email, u.is_active,
             ap.email AS profile_email
      FROM internal_users u
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      WHERE u.role = 'agent'
        AND (LOWER(u.username) = ? OR LOWER(u.email) = ? OR LOWER(ap.email) = ?)
      LIMIT 1
      `,
      [login, login, login]
    );

    if (!rows?.length) {
      // Avoid account enumeration
      return NextResponse.json({ ok: true });
    }

    const user = rows[0];
    if (!user.is_active) {
      return NextResponse.json({ ok: true });
    }

    const email = String(user.profile_email || user.email || "").trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: true });
    }

    const tempPassword = `LS-${crypto.randomBytes(4).toString("hex")}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await conn.query(`UPDATE internal_users SET password_hash = ? WHERE id = ? LIMIT 1`, [
      passwordHash,
      user.id,
    ]);

    const mail = buildResetEmail({ tempPassword });
    await sendEmail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("forgot-password error", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to process request" }, { status: 500 });
  } finally {
    conn.release();
  }
}
