// app/api/internal/auth/signup-agent/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: any) {
  return String(s || "").trim();
}
function normEmail(s: any) {
  return clean(s).toLowerCase();
}
function normUsername(s: any) {
  return clean(s).toLowerCase();
}

function isValidEmail(x: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function isValidUsername(x: string) {
  return /^[a-z0-9._-]{3,30}$/.test(x);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const firstName = clean(body?.first_name);
  const lastName = clean(body?.last_name);
  const email = normEmail(body?.email);
  const username = normUsername(body?.username);
  const password = clean(body?.password);
  const signupSecret = clean(body?.signup_secret);

  if (!firstName || !lastName || !email || !username || !password) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { ok: false, error: "Invalid username (3-30 chars: a-z, 0-9, dot, underscore, hyphen)" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Uniqueness checks
    const [uRows]: any = await conn.query(
      `SELECT id FROM internal_users WHERE username = ? LIMIT 1`,
      [username]
    );
    if (uRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Username already exists" }, { status: 409 });
    }

    // ✅ Check email uniqueness in the new canonical profile table
    const [eRows]: any = await conn.query(
      `SELECT id FROM linescout_agent_profiles WHERE email = ? LIMIT 1`,
      [email]
    );
    if (eRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create internal user
    const [insUser]: any = await conn.query(
      `
      INSERT INTO internal_users (username, password_hash, role, is_active)
      VALUES (?, ?, 'agent', 1)
      `,
      [username, passwordHash]
    );

    const userId = Number(insUser?.insertId || 0);
    if (!userId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Failed to create user" }, { status: 500 });
    }

    // ✅ Create agent profile in linescout_agent_profiles
    // NOTE: table has NOT NULL fields, so we set safe placeholders.
    // These will be completed in Profile later.
    const pendingPhone = `pending:${userId}`;
    await conn.query(
      `
      INSERT INTO linescout_agent_profiles
        (internal_user_id, first_name, last_name, email, china_phone, china_city, nationality, payout_status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
      [userId, firstName, lastName, email, pendingPhone, "pending", "Nigeria"]
    );

    await conn.commit();

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}

    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "Username or email already exists" }, { status: 409 });
    }

    console.error("POST /api/internal/auth/signup-agent error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to sign up" }, { status: 500 });
  } finally {
    conn.release();
  }
}
