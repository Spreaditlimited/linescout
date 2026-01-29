import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

function normPhone(v: any) {
  // Expecting China phone in E.164 ideally: +44XXXXXXXXXXX
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

  // Minimal sanity: must start with +44 (you can relax later)
  if (!phone.startsWith("+44") || phone.length < 10) {
    return NextResponse.json({ ok: false, error: "China phone must be in +44 format" }, { status: 400 });
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

    // OTP: 6 digits
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = hashOtp(otp, salt);

    // expires in 10 mins
    await conn.query(
      `
      INSERT INTO internal_agent_phone_otps (user_id, phone, otp_hash, expires_at)
      VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
      `,
      [userId, phone, `${salt}:${otpHash}`]
    );

    // TODO (production): send OTP via SMS provider here.
    // For now: in prod we do not reveal otp.
    const isProd = process.env.NODE_ENV === "production";

    return NextResponse.json(
  isProd ? { ok: true } : { ok: true, dev_otp: otp }
);
  } catch (e: any) {
    console.error("POST /api/internal/agent/phone/request-otp error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to request OTP" }, { status: 500 });
  } finally {
    conn.release();
  }
}