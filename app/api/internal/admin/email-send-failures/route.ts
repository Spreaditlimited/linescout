import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function requireAdminSession() {
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

async function ensureEmailSendFailureTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_email_send_failures (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NULL,
      email_normalized VARCHAR(255) NULL,
      pending_user_id BIGINT UNSIGNED NULL,
      kind VARCHAR(50) NOT NULL,
      error_message TEXT NULL,
      error_code VARCHAR(120) NULL,
      request_ip VARCHAR(80) NULL,
      user_agent VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_send_failures_email (email_normalized),
      INDEX idx_email_send_failures_pending (pending_user_id),
      INDEX idx_email_send_failures_kind (kind),
      INDEX idx_email_send_failures_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = Math.max(1, num(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, num(url.searchParams.get("page_size"), 25)));
  const offset = (page - 1) * pageSize;

  const conn = await db.getConnection();
  try {
    await ensureEmailSendFailureTable(conn);
    const [totalRows]: any = await conn.query(
      `SELECT COUNT(*) AS total FROM linescout_email_send_failures`
    );
    const total = Number(totalRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT id, email, kind, error_code, error_message, created_at
      FROM linescout_email_send_failures
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    return NextResponse.json({
      ok: true,
      page,
      page_size: pageSize,
      total,
      items: rows || [],
    });
  } catch (e: any) {
    console.error("GET /email-send-failures error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load email failures" }, { status: 500 });
  } finally {
    conn.release();
  }
}
