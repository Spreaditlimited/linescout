import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );
    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    return { ok: true as const, userId: Number(rows[0].id), role: String(rows[0].role || "") };
  } finally {
    conn.release();
  }
}

async function ensureSupportTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_agent_support_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      internal_user_id BIGINT UNSIGNED NOT NULL,
      subject VARCHAR(191) NULL,
      message TEXT NOT NULL,
      status ENUM('pending','reviewed','resolved') NOT NULL DEFAULT 'pending',
      admin_response_channel ENUM('email','whatsapp','phone') NULL,
      admin_note TEXT NULL,
      updated_by_internal_user_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_internal_user_status_created (internal_user_id, status, created_at),
      KEY idx_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
}

export async function GET() {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    await ensureSupportTable(conn);
    const [rows]: any = await conn.query(
      `
      SELECT
        id,
        subject,
        message,
        status,
        admin_response_channel,
        admin_note,
        created_at,
        updated_at
      FROM linescout_agent_support_requests
      WHERE internal_user_id = ?
      ORDER BY id DESC
      LIMIT 100
      `,
      [auth.userId]
    );
    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  if (!message || message.length < 8) {
    return NextResponse.json({ ok: false, error: "Please enter a clear message (at least 8 characters)." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureSupportTable(conn);
    const [res]: any = await conn.query(
      `
      INSERT INTO linescout_agent_support_requests
      (internal_user_id, subject, message, status)
      VALUES (?, ?, ?, 'pending')
      `,
      [auth.userId, subject || null, message]
    );
    return NextResponse.json({ ok: true, id: Number(res?.insertId || 0) });
  } finally {
    conn.release();
  }
}
