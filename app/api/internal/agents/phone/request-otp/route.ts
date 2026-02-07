import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { sendSinchSms } from "@/lib/sinch";
import { findReviewerByPhone } from "@/lib/reviewer-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// noop: deploy trigger

function clean(v: any) {
  return String(v ?? "").trim();
}

function normPhone(v: any) {
  // Expecting test phone in E.164 format, e.g. +86XXXXXXXXXXX
  const s = clean(v);
  return s.replace(/\s+/g, "");
}

function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = Number(body?.user_id || 0);
  const phone = normPhone(body?.phone);

  if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });

  const REQUIRED_PREFIX = "+86";
  // Minimal sanity: must start with +86 for now (test-only)
  if (!phone.startsWith(REQUIRED_PREFIX) || phone.length < 10) {
    return NextResponse.json(
      { ok: false, error: `Phone must be in ${REQUIRED_PREFIX} format` },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    // Ensure user exists + role agent
    const [rows]: any = await conn.query(
      `SELECT id, role, is_active FROM internal_users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (!rows?.length) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    if (String(rows[0].role) !== "agent") return NextResponse.json({ ok: false, error: "Not an agent" }, { status: 403 });
    if (!rows[0].is_active) return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });

    const reviewer = await findReviewerByPhone(conn, "agent", phone);
    const reviewerOtp = reviewer ? String(reviewer.fixed_otp || "").trim() : "";
    if (reviewer && !/^\d{6}$/.test(reviewerOtp)) {
      return NextResponse.json({ ok: false, error: "Reviewer OTP not configured." }, { status: 400 });
    }

    // OTP: 6 digits
    const otp = reviewer ? reviewerOtp : String(Math.floor(100000 + Math.random() * 900000));
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = hashOtp(otp, salt);

    await conn.beginTransaction();

    // Ensure agent profile exists in canonical table
    const [pRows]: any = await conn.query(
      `SELECT id FROM linescout_agent_profiles WHERE internal_user_id = ? LIMIT 1`,
      [userId]
    );

    if (!pRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Agent profile not found" }, { status: 400 });
    }

    // ✅ Important: phone edit or fresh OTP request makes phone "pending" until verify-otp succeeds
    await conn.query(
      `
      UPDATE linescout_agent_profiles
      SET china_phone = ?, china_phone_verified_at = NULL, updated_at = NOW()
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [phone, userId]
    );

    // expires in 10 mins
    await conn.query(
      `
      INSERT INTO internal_agent_phone_otps (user_id, phone, otp_hash, expires_at)
      VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
      `,
      [userId, phone, `${salt}:${otpHash}`]
    );

    await conn.commit();

    // Dev convenience: only reveal OTP when explicitly enabled
    const revealOtp =
      reviewer ||
      process.env.NODE_ENV !== "production" ||
      String(process.env.REVEAL_AGENT_PHONE_OTP || "") === "1";

    const smsResult = reviewer
      ? { ok: false as const, error: "SKIPPED_REVIEWER" }
      : await sendSinchSms({
          to: phone,
          body: `Your LineScout OTP is ${otp}`,
        });

    const phoneTail = phone.slice(-4);
    if (!smsResult.ok) {
      const err = smsResult.error || "UNKNOWN_ERROR";
      const isSkipped = err === "SINCH_SMS_DISABLED" || err === "SKIPPED_REVIEWER";
      if (isSkipped) {
        console.warn(`Sinch SMS skipped for agent phone ***${phoneTail}: ${err}`);
      } else {
        console.error(`Sinch SMS failed for agent phone ***${phoneTail}:`, smsResult);
        return NextResponse.json(
          { ok: false, error: "Failed to send OTP SMS. Please try again." },
          { status: 502 }
        );
      }
    } else {
      console.log(`Sinch SMS sent for agent phone ***${phoneTail}`);
    }

    return NextResponse.json({
      ok: true,
      dev_otp: revealOtp ? otp : undefined,
      sms_sent: smsResult.ok === true,
    });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}

    console.error("POST /api/internal/agent/phone/request-otp error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to request OTP" }, { status: 500 });
  } finally {
    conn.release();
  }
}
