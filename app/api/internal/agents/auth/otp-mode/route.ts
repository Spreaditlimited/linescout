import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOtpMode(conn: any) {
  const [cols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'agent_otp_mode'
    LIMIT 1
    `
  );

  if (!cols?.length) return "phone";

  const [rows]: any = await conn.query("SELECT agent_otp_mode FROM linescout_settings ORDER BY id DESC LIMIT 1");
  const mode = String(rows?.[0]?.agent_otp_mode || "phone").toLowerCase();
  return mode === "email" ? "email" : "phone";
}

export async function GET() {
  const conn = await db.getConnection();
  try {
    const mode = await getOtpMode(conn);
    return NextResponse.json({ ok: true, mode });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load OTP mode" }, { status: 500 });
  } finally {
    conn.release();
  }
}
