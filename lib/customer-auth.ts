import { NextResponse } from "next/server";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { hashToken, newToken } from "@/lib/password-security";

export class AuthError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function authJson(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export async function limitAuth(req: Request, scope: string, email = "") {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim().slice(0, 64);
  const bucket = Math.floor(Date.now() / 900000);
  const keys = [{ key: `${scope}:ip:${ip}:${bucket}`, max: 30 }];
  if (email) keys.push({ key: `${scope}:email:${email}:${bucket}`, max: scope === "email" ? 3 : 10 });
  for (const item of keys) {
    const key = hashToken(item.key);
    await db.execute("INSERT INTO linescout_auth_rate_limits (bucket_key, hits, expires_at) VALUES (?,1,DATE_ADD(NOW(), INTERVAL 30 MINUTE)) ON DUPLICATE KEY UPDATE hits=hits+1", [key]);
    const [rows] = await db.execute<RowDataPacket[]>("SELECT hits FROM linescout_auth_rate_limits WHERE bucket_key=?", [key]);
    if (Number(rows[0]?.hits) > item.max) throw new AuthError("Too many attempts. Please try again in 15 minutes.", 429);
  }
}
export async function issueSession(conn: PoolConnection, req: Request, userId: number, next: string) {
  const token = newToken();
  await conn.execute(`INSERT INTO linescout_user_sessions (user_id,refresh_token_hash,expires_at,user_agent,ip_address,last_seen_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 30 DAY),?,?,NOW())`, [userId, hashToken(token), (req.headers.get("user-agent") || "").slice(0,255), (req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim().slice(0,45)]);
  const response = authJson({ ok: true, next });
  response.cookies.set("linescout_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60*60*24*30 });
  return response;
}
export function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1);
  try { return raw ? decodeURIComponent(raw) : ""; } catch { return ""; }
}
