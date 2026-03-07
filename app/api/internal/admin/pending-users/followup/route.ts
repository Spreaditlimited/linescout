import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sendNoticeEmail } from "@/lib/notice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normDate(input: any) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function guessFirstName(email: string) {
  const local = String(email || "").split("@")[0] || "";
  const token = local.split(/[._-]+/)[0] || "";
  const cleaned = token.replace(/[^a-zA-Z]/g, "");
  if (!cleaned || cleaned.length < 2) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
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

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

async function ensurePendingUserFollowupColumns(conn: any) {
  const [cols]: any = await conn.query("SHOW COLUMNS FROM pending_users");
  const existing = new Set((cols || []).map((r: any) => String(r.Field || "")));
  if (!existing.has("followup_email_count")) {
    try {
      await conn.query(
        "ALTER TABLE pending_users ADD COLUMN followup_email_count INT NOT NULL DEFAULT 0"
      );
    } catch (e: any) {
      if (String(e?.code || "").toUpperCase() !== "ER_DUP_FIELDNAME") throw e;
    }
  }
  if (!existing.has("last_followup_email_at")) {
    try {
      await conn.query("ALTER TABLE pending_users ADD COLUMN last_followup_email_at DATETIME NULL");
    } catch (e: any) {
      if (String(e?.code || "").toUpperCase() !== "ER_DUP_FIELDNAME") throw e;
    }
  }
}

async function ensureFollowupRunsTable(conn: any) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_pending_user_followup_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by_internal_user_id BIGINT UNSIGNED NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      pending_total INT NOT NULL DEFAULT 0,
      sent_count INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
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
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 5)));

  const conn = await db.getConnection();
  try {
    await ensureFollowupRunsTable(conn);
    const [rows]: any = await conn.query(
      `
      SELECT id, created_at, start_date, end_date, pending_total, sent_count, error_count
      FROM linescout_pending_user_followup_runs
      ORDER BY id DESC
      LIMIT ?
      `,
      [limit]
    );
    return NextResponse.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    console.error("GET /pending-users/followup error:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load follow-up log" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const startDate = normDate(body?.start_date);
  const endDate = normDate(body?.end_date);
  if (!startDate || !endDate) {
    return NextResponse.json({ ok: false, error: "Invalid date range" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensurePendingUserFollowupColumns(conn);
    await ensureFollowupRunsTable(conn);
    await ensureEmailSendFailureTable(conn);

    const [rows]: any = await conn.query(
      `
      SELECT id, email, created_at
      FROM pending_users
      WHERE DATE(created_at) BETWEEN ? AND ?
      ORDER BY id DESC
      `,
      [startDate, endDate]
    );

    const pending = rows || [];
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    const signInUrl = `${baseUrl}/sign-in`;
    const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

    let sent = 0;
    let errors = 0;

    for (const row of pending) {
      const email = String(row.email || "").trim();
      if (!email) continue;
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
        ? dateFmt.format(createdAt)
        : "recently";
      const firstName = guessFirstName(email);
      const greeting = firstName ? `Hello ${firstName},` : "Hello,";

      const lines = [
        greeting,
        `We noticed you attempted to create an account on the Sure Import's LineScout platform on ${createdLabel} but did not follow through.`,
        "If you still want to source products from China using our website, use the link below to jump right in.",
        "A few things to note:",
        "1) When you request an OTP, give it some time to arrive in your inbox and also check your spam folder.",
        "2) Each OTP expires after 10 minutes.",
        "3) Do not make repeated requests for OTP as our system will interpret that as spamming.",
        "4) If you request more than one OTP, use the most recent code sent to you.",
        `Once again, here's the link to sign in: ${signInUrl}`,
        "Thank you.",
        "LineScout Team",
      ];

      try {
        await sendNoticeEmail({
          to: email,
          subject: "Complete your LineScout sign in",
          title: "Finish signing in to LineScout",
          lines,
          ctaLabel: "Sign in",
          ctaUrl: signInUrl,
          footerNote: "This email was sent because an account sign-in was started on LineScout.",
        });

        await conn.query(
          `
          UPDATE pending_users
          SET followup_email_count = COALESCE(followup_email_count, 0) + 1,
              last_followup_email_at = NOW()
          WHERE id = ?
          `,
          [row.id]
        );
        sent += 1;
      } catch (e: any) {
        errors += 1;
        const msg = String(e?.message || e || "").slice(0, 5000);
        const code = String(e?.code || e?.name || "").slice(0, 120) || null;
        await conn.query(
          `
          INSERT INTO linescout_email_send_failures
            (email, email_normalized, pending_user_id, kind, error_message, error_code, request_ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            email,
            email.toLowerCase(),
            row.id,
            "pending_followup",
            msg || null,
            code,
            null,
            null,
          ]
        );
      }
    }

    await conn.query(
      `
      INSERT INTO linescout_pending_user_followup_runs
        (created_by_internal_user_id, start_date, end_date, pending_total, sent_count, error_count)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [auth.adminId, startDate, endDate, pending.length, sent, errors]
    );

    return NextResponse.json({
      ok: true,
      total: pending.length,
      sent,
      errors,
    });
  } catch (e: any) {
    console.error("POST /pending-users/followup error:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to send follow-up emails" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
