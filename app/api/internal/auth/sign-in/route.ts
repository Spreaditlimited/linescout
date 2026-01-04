import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = body?.email?.trim(); // frontend sends `email`
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT id, username, password_hash, role, is_active
       FROM internal_users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    if (!rows.length) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const user = rows[0];

    if (!user.is_active) {
      return NextResponse.json({ message: "Account disabled" }, { status: 403 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    // 64-hex token (cookie will store this)
    const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
      .toString("hex");

    // Create session record (no expiry for now)
    await conn.query(
      `INSERT INTO internal_sessions (user_id, session_token)
       VALUES (?, ?)`,
      [user.id, sessionToken]
    );

    const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME!;
    const res = NextResponse.json({ ok: true });

    res.cookies.set({
  name: cookieName,
  value: sessionToken,
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production", // IMPORTANT
});

    return res;
  } finally {
    conn.release();
  }
}