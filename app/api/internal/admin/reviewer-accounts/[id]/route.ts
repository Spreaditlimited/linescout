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

export async function PATCH(req: Request, ctx: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = Number(ctx?.params?.id || 0);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const appTarget = clean(body?.app_target);
  const authChannel = clean(body?.auth_channel);
  const email = clean(body?.email);
  const phone = clean(body?.phone);
  const fixedOtp = clean(body?.fixed_otp);
  const notes = clean(body?.notes);
  const bypassEnabled =
    typeof body?.bypass_enabled === "boolean"
      ? body.bypass_enabled
        ? 1
        : 0
      : null;

  const updates: string[] = [];
  const params: any[] = [];

  if (appTarget) {
    if (appTarget !== "mobile" && appTarget !== "agent") {
      return NextResponse.json({ ok: false, error: "app_target must be mobile or agent" }, { status: 400 });
    }
    updates.push("app_target = ?");
    params.push(appTarget);
  }

  if (authChannel) {
    if (authChannel !== "email" && authChannel !== "phone") {
      return NextResponse.json({ ok: false, error: "auth_channel must be email or phone" }, { status: 400 });
    }
    updates.push("auth_channel = ?");
    params.push(authChannel);
  }

  if (fixedOtp) {
    if (!/^\d{6}$/.test(fixedOtp)) {
      return NextResponse.json({ ok: false, error: "fixed_otp must be 6 digits" }, { status: 400 });
    }
    updates.push("fixed_otp = ?");
    params.push(fixedOtp);
  }

  if (typeof bypassEnabled === "number") {
    updates.push("bypass_enabled = ?");
    params.push(bypassEnabled);
  }

  if (notes) {
    updates.push("notes = ?");
    params.push(notes);
  } else if (body?.notes === "") {
    updates.push("notes = NULL");
  }

  if (email || body?.email === "") {
    const emailNorm = email ? normalizeEmail(email) : "";
    updates.push("email = ?");
    params.push(email || null);
    updates.push("email_normalized = ?");
    params.push(emailNorm || null);
  }

  if (phone || body?.phone === "") {
    const phoneNorm = phone ? normalizePhone(phone) : "";
    updates.push("phone = ?");
    params.push(phone || null);
    updates.push("phone_normalized = ?");
    params.push(phoneNorm || null);
  }

  if (!updates.length) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureReviewerTable(conn);

    const [res]: any = await conn.query(
      `
      UPDATE linescout_reviewer_accounts
      SET ${updates.join(", ")}
      WHERE id = ?
      LIMIT 1
      `,
      [...params, id]
    );

    if (!res?.affectedRows) {
      return NextResponse.json({ ok: false, error: "Reviewer account not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PATCH /api/internal/admin/reviewer-accounts/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update reviewer account" }, { status: 500 });
  } finally {
    conn.release();
  }
}
