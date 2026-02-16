import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { findReviewerByEmail, normalizeEmail } from "@/lib/reviewer-accounts";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex"); // 64 chars when bytes=32
}

async function getDb() {
  return db.getConnection();
}

function getClientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || null;
}

export async function POST(req: Request) {
  let conn: PoolConnection | null = null;
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

    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    conn = await getDb();

    // Reviewer bypass
    const reviewer = await findReviewerByEmail(conn, "mobile", email);
    if (reviewer) {
      const fixedOtp = String(reviewer.fixed_otp || "").trim();
      if (!/^\d{6}$/.test(fixedOtp)) {
        return NextResponse.json({ ok: false, error: "Reviewer OTP not configured" }, { status: 400 });
      }
      if (otpRaw !== fixedOtp) {
        return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
      }

      // Ensure user exists
      const [urows] = await conn.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE email_normalized = ? LIMIT 1",
        [email]
      );
      let userId: number;
      if (urows.length) {
        userId = Number(urows[0].id);
      } else {
        const [ins]: any = await conn.execute(
          "INSERT INTO users (email, email_normalized) VALUES (?, ?)",
          [emailRaw.trim(), email]
        );
        userId = Number(ins.insertId);
      }

      const refreshToken = randomToken(32);
      const refreshHash = sha256(refreshToken);

      await conn.execute(
        `
        INSERT INTO linescout_user_sessions
          (user_id, refresh_token_hash, expires_at, user_agent, ip_address, last_seen_at)
        VALUES
          (?, ?, (NOW() + INTERVAL 30 DAY), ?, ?, NOW())
        `,
        [userId, refreshHash, userAgent, ip]
      );

      const res = NextResponse.json({
        ok: true,
        user_id: userId,
        refresh_token: refreshToken,
      });

      res.cookies.set({
        name: "linescout_session",
        value: refreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    const otpHash = sha256(otpRaw);

    // 1) Find pending user (OTP is tied to pending_users, not users)
    const [prows] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM pending_users WHERE email_normalized = ? LIMIT 1",
      [email]
    );
    if (!prows.length) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
    }
    const pendingUserId = Number(prows[0].id);

    // 2) Find latest unconsumed, unexpired OTP matching hash
    const [orows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM email_otps
      WHERE pending_user_id = ?
        AND otp_code = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [pendingUserId, otpHash]
    );

    if (!orows.length) {
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 401 });
    }

    const otpId = Number(orows[0].id);

    // 3) Ensure user exists (create only after OTP is verified)
    const [urows] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email_normalized = ? LIMIT 1",
      [email]
    );
    let userId: number;
    if (urows.length) {
      userId = Number(urows[0].id);
    } else {
      const [ins]: any = await conn.execute(
        "INSERT INTO users (email, email_normalized) VALUES (?, ?)",
        [emailRaw.trim(), email]
      );
      userId = Number(ins.insertId);
    }

    // 4) Consume OTP (attach to user for audit)
    await conn.execute("UPDATE email_otps SET consumed_at = NOW(), user_id = ? WHERE id = ?", [userId, otpId]);

    // Cleanup pending user (optional but keeps table tidy)
    await conn.execute("DELETE FROM pending_users WHERE id = ? LIMIT 1", [pendingUserId]);

    // 5) Create session (refresh token stored hashed)
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

    const res = NextResponse.json({
      ok: true,
      user_id: userId,
      // keep for compatibility (mobile). Web should rely on cookies only.
      refresh_token: refreshToken,
    });

    res.cookies.set({
      name: "linescout_session",
      value: refreshToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
