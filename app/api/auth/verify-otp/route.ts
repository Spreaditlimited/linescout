import { NextResponse } from "next/server";
import crypto from "crypto";
import mysql from "mysql2/promise";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex"); // 64 chars when bytes=32
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

function getClientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const emailRaw = String(body?.email || "");
    const email = normalizeEmail(emailRaw);

    const otpRaw = String(body?.otp || "").trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(otpRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 400 });
    }

    const otpHash = sha256(otpRaw);
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const conn = await getDb();

    // 1) Find user
    const [urows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM users WHERE email_normalized = ? LIMIT 1",
      [email]
    );
    if (!urows.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
    }
    const userId = Number(urows[0].id);

    // 2) Find latest unconsumed, unexpired OTP matching hash
    const [orows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT id
      FROM email_otps
      WHERE user_id = ?
        AND otp_code = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId, otpHash]
    );

    if (!orows.length) {
      await conn.end();
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
    }

    const otpId = Number(orows[0].id);

    // 3) Consume OTP
    await conn.execute("UPDATE email_otps SET consumed_at = NOW() WHERE id = ?", [otpId]);

    // 4) Create session (refresh token stored hashed)
    const refreshToken = randomToken(32);
    const refreshHash = sha256(refreshToken);

    // 30 days session (adjust later)
    await conn.execute(
      `
      INSERT INTO linescout_user_sessions
        (user_id, refresh_token_hash, expires_at, user_agent, ip_address, last_seen_at)
      VALUES
        (?, ?, (NOW() + INTERVAL 30 DAY), ?, ?, NOW())
      `,
      [userId, refreshHash, userAgent, ip]
    );

    await conn.end();

    // MVP: return refresh token directly.
    // Later: add short-lived access token + refresh endpoint.
    return NextResponse.json({
      ok: true,
      refresh_token: refreshToken,
      user_id: userId,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}