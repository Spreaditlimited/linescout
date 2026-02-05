import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserTokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function getDb() {
  return db.getConnection();
}

export async function POST(req: Request) {
  try {
    const token = getUserTokenFromRequest(req);
    if (token) {
      const conn = await getDb();
      await conn.execute(
        "UPDATE linescout_user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = ?",
        [sha256(token)]
      );
      conn.release();
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: "linescout_session",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
