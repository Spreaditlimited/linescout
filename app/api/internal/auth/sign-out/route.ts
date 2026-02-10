import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function POST(req: Request) {
  const adminCookieName = (process.env.INTERNAL_AUTH_COOKIE_NAME || "linescout_admin_session").trim();
  const agentCookieName = (process.env.AGENT_AUTH_COOKIE_NAME || "linescout_agent_session").trim();

  const headerApp = String(req.headers.get("x-linescout-app") || "").toLowerCase();
  const referer = String(req.headers.get("referer") || "");
  const isAgent = headerApp === "agent" || referer.includes("/agent-app");
  const cookieName = isAgent ? agentCookieName : adminCookieName;

  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader
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
