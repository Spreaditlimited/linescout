import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/affiliates";

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie");
  const token = readCookie(cookieHeader, "linescout_affiliate_session");
  if (token) {
    const hash = sha256(token);
    const conn = await db.getConnection();
    try {
      await conn.query(
        `DELETE FROM linescout_affiliate_sessions WHERE session_token_hash = ? LIMIT 1`,
        [hash]
      );
    } finally {
      conn.release();
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "linescout_affiliate_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

