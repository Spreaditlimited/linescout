import { NextResponse } from "next/server";
import crypto from "crypto";
import mysql from "mysql2/promise";

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

    // 4) Send email (placeholder)
    // TODO: integrate your email provider (Resend / Postmark / SES).
    // For now we just return ok:true. Do NOT return OTP to client in production.
    console.log("[request-otp] email:", email, "otp:", otp);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}