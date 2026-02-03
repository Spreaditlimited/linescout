import { NextResponse } from "next/server";
import { headers } from "next/headers";
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

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();

  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active, ap.email
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    return {
      ok: true as const,
      userId: Number(rows[0].id),
      role: String(rows[0].role || ""),
      email: String(rows[0].email || ""),
    };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

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
  if (!auth.email) return NextResponse.json({ ok: false, error: "Missing agent email" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [recentRows]: any = await conn.query(
      `SELECT created_at
       FROM linescout_payout_account_otps
       WHERE owner_type = 'agent' AND owner_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [auth.userId]
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
       VALUES ('agent', ?, ?, ?, ?, ?, ?, ?)`,
      [auth.userId, auth.email, bankCode, accountNumber, otpHash, salt, expiresAt]
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
      to: auth.email,
      replyTo: "hello@sureimports.com",
      subject: "Confirm payout bank change",
      text: mail.text,
      html: mail.html,
    });

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
