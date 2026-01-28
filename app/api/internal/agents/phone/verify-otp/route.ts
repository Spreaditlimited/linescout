import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}
function normPhone(v: any) {
  return clean(v).replace(/\s+/g, "");
}
function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = Number(body?.user_id || 0);
  const phone = normPhone(body?.phone);
  const otp = clean(body?.otp);

  if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
  if (!otp || otp.length !== 6) return NextResponse.json({ ok: false, error: "otp must be 6 digits" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // latest valid OTP row (un-used, not expired)
    const [rows]: any = await conn.query(
      `
      SELECT id, otp_hash, attempts
      FROM internal_agent_phone_otps
      WHERE user_id = ?
        AND phone = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId, phone]
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

    // increment attempts first (prevents brute force)
    await conn.query(
      `UPDATE internal_agent_phone_otps SET attempts = attempts + 1 WHERE id = ?`,
      [otpRowId]
    );

    const stored = String(row.otp_hash || ""); // format: salt:hash
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

    // mark used
    await conn.query(
      `UPDATE internal_agent_phone_otps SET used_at = NOW() WHERE id = ?`,
      [otpRowId]
    );

    // update agent profile
    await conn.query(
      `
      UPDATE internal_agent_profiles
      SET
        china_phone = ?,
        china_phone_verified = 1,
        onboarding_status = CASE
          WHEN onboarding_status = 'signup' THEN 'phone_verified'
          ELSE onboarding_status
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
      LIMIT 1
      `,
      [phone, userId]
    );

    await conn.commit();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    console.error("POST /api/internal/agent/phone/verify-otp error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to verify OTP" }, { status: 500 });
  } finally {
    conn.release();
  }
}