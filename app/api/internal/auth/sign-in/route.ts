import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: any) {
  return String(s || "").trim();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const login = clean(body?.login || body?.email || body?.username);
  const password = clean(body?.password);

  if (!login || !password) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }

  const cookieName = clean(process.env.INTERNAL_AUTH_COOKIE_NAME);
  if (!cookieName) {
    return NextResponse.json({ ok: false, error: "Missing INTERNAL_AUTH_COOKIE_NAME" }, { status: 500 });
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

    // ✅ web admin still works (cookie)
    res.cookies.set({
      name: cookieName,
      value: sessionToken,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (e: any) {
    console.error("POST /api/internal/auth/sign-in error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to sign in" }, { status: 500 });
  } finally {
    conn.release();
  }
}
