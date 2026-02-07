import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  ensureReviewerTable,
  normalizeEmail,
  normalizePhone,
} from "@/lib/reviewer-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function clean(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const appTarget = clean(url.searchParams.get("app")) || "";
  const q = clean(url.searchParams.get("q")).toLowerCase();

  const conn = await db.getConnection();
  try {
    await ensureReviewerTable(conn);

    const params: any[] = [];
    const clauses: string[] = [];

    if (appTarget === "mobile" || appTarget === "agent") {
      clauses.push("app_target = ?");
      params.push(appTarget);
    }

    if (q) {
      clauses.push(
        `(LOWER(COALESCE(email,'')) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(notes,'')) LIKE ?)`
      );
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_reviewer_accounts
      ${where}
      ORDER BY id DESC
      LIMIT 200
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    console.error("GET /api/internal/admin/reviewer-accounts error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load reviewer accounts" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));

  const appTarget = clean(body?.app_target);
  const authChannel = clean(body?.auth_channel);
  const email = clean(body?.email);
  const phone = clean(body?.phone);
  const fixedOtp = clean(body?.fixed_otp);
  const notes = clean(body?.notes);
  const bypassEnabled = body?.bypass_enabled === false ? 0 : 1;

  if (appTarget !== "mobile" && appTarget !== "agent") {
    return NextResponse.json({ ok: false, error: "app_target must be mobile or agent" }, { status: 400 });
  }

  const channel = appTarget === "mobile" ? "email" : authChannel || "email";
  if (channel !== "email" && channel !== "phone") {
    return NextResponse.json({ ok: false, error: "auth_channel must be email or phone" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(fixedOtp)) {
    return NextResponse.json({ ok: false, error: "fixed_otp must be 6 digits" }, { status: 400 });
  }

  const emailNorm = channel === "email" ? normalizeEmail(email) : "";
  const phoneNorm = channel === "phone" ? normalizePhone(phone) : "";

  if (channel === "email" && (!emailNorm || !emailNorm.includes("@"))) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (channel === "phone" && !phoneNorm) {
    return NextResponse.json({ ok: false, error: "Valid phone is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureReviewerTable(conn);

    const [existing]: any = await conn.query(
      `
      SELECT id
      FROM linescout_reviewer_accounts
      WHERE app_target = ?
        AND auth_channel = ?
        AND (
          (auth_channel = 'email' AND email_normalized = ?)
          OR (auth_channel = 'phone' AND phone_normalized = ?)
        )
      LIMIT 1
      `,
      [appTarget, channel, emailNorm || null, phoneNorm || null]
    );

    if (existing?.length) {
      return NextResponse.json({ ok: false, error: "Reviewer account already exists" }, { status: 409 });
    }

    await conn.query(
      `
      INSERT INTO linescout_reviewer_accounts
        (app_target, auth_channel, email, email_normalized, phone, phone_normalized, fixed_otp, bypass_enabled, notes)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        appTarget,
        channel,
        channel === "email" ? email : null,
        channel === "email" ? emailNorm : null,
        channel === "phone" ? phone : null,
        channel === "phone" ? phoneNorm : null,
        fixedOtp,
        bypassEnabled,
        notes || null,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/internal/admin/reviewer-accounts error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to create reviewer account" }, { status: 500 });
  } finally {
    conn.release();
  }
}
