import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: any) {
  return String(s || "").trim();
}

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
  const body = await req.json().catch(() => ({}));

  const login = clean(body?.login || body?.email || body?.username);
  const password = clean(body?.password);
  const app = clean(body?.app || "admin").toLowerCase();

  if (!login || !password) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }

  const adminCookieName = clean(process.env.INTERNAL_AUTH_COOKIE_NAME || "linescout_admin_session");
  const agentCookieName = clean(process.env.AGENT_AUTH_COOKIE_NAME || "linescout_agent_session");
  const cookieName = app === "agent" ? agentCookieName : adminCookieName;
  if (!cookieName) {
    return NextResponse.json({ ok: false, error: "Missing auth cookie name" }, { status: 500 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.username, u.email, u.password_hash, u.role, u.is_active,
             ap.email AS profile_email
      FROM internal_users u
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      WHERE u.username = ? OR u.email = ? OR ap.email = ?
      LIMIT 1
      `,
      [login, login, login]
    );

    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const user = rows[0];

    if (!user.is_active) {
      return NextResponse.json({ ok: false, error: "Account disabled" }, { status: 403 });
    }

    const role = String(user.role || "").toLowerCase();
    if (app === "agent" && role !== "agent") {
      return NextResponse.json({ ok: false, error: "Agent access only" }, { status: 403 });
    }
    if (app !== "agent" && role !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access only" }, { status: 403 });
    }

    const ok = await bcrypt.compare(password, String(user.password_hash || ""));
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");

    await conn.query(
      `INSERT INTO internal_sessions (user_id, session_token) VALUES (?, ?)`,
      [Number(user.id), sessionToken]
    );

    const res = NextResponse.json({
      ok: true,
      session_token: sessionToken, // ✅ mobile will store this
      cookie_name: cookieName,
      user: {
        id: Number(user.id),
        role: String(user.role || "agent"),
        username: String(user.username || ""),
        email: user.email ? String(user.email) : user.profile_email ? String(user.profile_email) : null,
      },
    });

    const url = new URL(req.url);
    const host = req.headers.get("host") || url.host;
    const forwardedProto = String(req.headers.get("x-forwarded-proto") || "").toLowerCase();
    const isHttps = forwardedProto === "https" || url.protocol === "https:";
    const isProd = process.env.NODE_ENV === "production";
    const cookieDomain = isProd ? getCookieDomain(host) : undefined;
    // ✅ web admin still works (cookie)
    res.cookies.set({
      name: cookieName,
      value: sessionToken,
      httpOnly: true,
      path: "/",
      sameSite: isProd ? "none" : "lax",
      secure: isProd ? isHttps : false,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch (e: any) {
    console.error("POST /api/internal/auth/sign-in error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to sign in" }, { status: 500 });
  } finally {
    conn.release();
  }
}
