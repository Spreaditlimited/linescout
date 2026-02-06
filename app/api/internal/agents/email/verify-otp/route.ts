import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = Number(body?.user_id || 0);
  const email = normalizeEmail(body?.email);
  const otp = clean(body?.otp);

  if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  if (!email || !email.includes("@")) return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
  if (!/^\d{6}$/.test(otp)) return NextResponse.json({ ok: false, error: "otp must be 6 digits" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureEmailOtpTable(conn);
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `
      SELECT id, otp_hash, attempts
      FROM internal_agent_email_otps
      WHERE user_id = ?
        AND email = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId, email]
    );

    if (!rows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "OTP not found or expired" }, { status: 400 });
    }

    const row = rows[0];
    const otpRowId = Number(row.id);
    const attempts = Number(row.attempts || 0);

    if (attempts >= 5) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Too many attempts. Request a new OTP." }, { status: 429 });
    }

    await conn.query(`UPDATE internal_agent_email_otps SET attempts = attempts + 1 WHERE id = ?`, [otpRowId]);

    const stored = String(row.otp_hash || "");
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Bad OTP record" }, { status: 500 });
    }

    const computed = hashOtp(otp, salt);
    if (computed !== hash) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Invalid OTP" }, { status: 400 });
    }

    await conn.query(`UPDATE internal_agent_email_otps SET used_at = NOW() WHERE id = ?`, [otpRowId]);

    // ensure profile email is set for this agent (durable)
    const [upd]: any = await conn.query(
      `
      UPDATE linescout_agent_profiles
      SET email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [email, userId]
    );

    if (!upd?.affectedRows) {
      await conn.query(
        `
        INSERT INTO linescout_agent_profiles
          (internal_user_id, first_name, last_name, email, china_city, nationality, payout_status)
        SELECT
          u.id,
          COALESCE(u.first_name, ''),
          COALESCE(u.last_name, ''),
          ?,
          'pending',
          'Nigeria',
          'pending'
        FROM internal_users u
        WHERE u.id = ?
        LIMIT 1
        `,
        [email, userId]
      );
    }

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/agents/email/verify-otp error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to verify OTP" }, { status: 500 });
  } finally {
    conn.release();
  }
}
