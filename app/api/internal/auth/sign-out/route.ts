import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function getCookieDomain(hostHeader: string) {
  const host = String(hostHeader || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return undefined;
  if (host.endsWith(".sureimports.com")) return ".sureimports.com";
  return undefined;
}

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
  const url = new URL(req.url);
  const host = req.headers.get("host") || url.host;
  const forwardedProto = String(req.headers.get("x-forwarded-proto") || "").toLowerCase();
  const isHttps = forwardedProto === "https" || url.protocol === "https:";
  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = isProd ? getCookieDomain(host) : undefined;
  res.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: isProd ? "none" : "lax",
    secure: isProd ? isHttps : false,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  return res;
}
