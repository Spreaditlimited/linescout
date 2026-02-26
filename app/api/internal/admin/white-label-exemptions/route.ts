import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  ensureWhiteLabelExemptionsTable,
  normalizeEmail,
} from "@/lib/white-label-exemptions";

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

function toMonths(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q")).toLowerCase();

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelExemptionsTable(conn);

    const params: any[] = [];
    const clauses: string[] = [];
    if (q) {
      clauses.push(`(LOWER(email) LIKE ? OR LOWER(COALESCE(notes,'')) LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_white_label_exemptions
      ${where}
      ORDER BY id DESC
      LIMIT 200
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    console.error("GET /api/internal/admin/white-label-exemptions error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load exemptions" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const email = clean(body?.email);
  const months = toMonths(body?.months);
  const notes = clean(body?.notes);
  const source = clean(body?.source) || "manual";

  const emailNorm = normalizeEmail(email);
  if (!emailNorm || !emailNorm.includes("@")) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (!months) {
    return NextResponse.json({ ok: false, error: "Months must be between 1 and 12" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelExemptionsTable(conn);

    await conn.query(
      `
      UPDATE linescout_white_label_exemptions
      SET revoked_at = NOW()
      WHERE email_normalized = ?
        AND revoked_at IS NULL
      `,
      [emailNorm]
    );

    await conn.query(
      `
      INSERT INTO linescout_white_label_exemptions
        (email, email_normalized, starts_at, ends_at, source, notes, created_by_internal_user_id)
      VALUES
        (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), ?, ?, ?)
      `,
      [email, emailNorm, months, source, notes || null, auth.adminId]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-exemptions error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to create exemption" }, { status: 500 });
  } finally {
    conn.release();
  }
}
