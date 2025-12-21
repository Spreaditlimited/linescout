import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function POST(req: Request) {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME!;
  const token = (req.headers.get("cookie") || "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(cookieName + "="))
    ?.split("=")[1];

  if (token) {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE internal_sessions
         SET revoked_at = NOW()
         WHERE session_token = ? AND revoked_at IS NULL`,
        [token]
      );
    } finally {
      conn.release();
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  return res;
}