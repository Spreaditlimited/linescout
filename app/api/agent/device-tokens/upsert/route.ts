// app/api/agent/device-tokens/upsert/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Platform = "ios" | "android" | "web";
function isPlatform(x: any): x is Platform {
  return x === "ios" || x === "android" || x === "web";
}

async function requireInternalAgentOrAdmin() {
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
  if (!token) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.role,
         u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

    const id = Number(rows[0].id);
    const role = String(rows[0].role || "");

    if (role !== "admin" && role !== "agent") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }

    return { ok: true as const, id, role };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireInternalAgentOrAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);

    const platform = body?.platform;
    const token = String(body?.token || "").trim();
    const device_id = body?.device_id ? String(body.device_id).trim() : null;
    const app_version = body?.app_version ? String(body.app_version).trim() : null;
    const locale = body?.locale ? String(body.locale).trim() : null;

    if (!isPlatform(platform)) {
      return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
    }

    if (!token || token.length < 20 || token.length > 512) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await conn.query(
        `
        INSERT INTO linescout_agent_device_tokens
          (agent_id, platform, token, device_id, app_version, locale, is_active, last_seen_at)
        VALUES
          (?, ?, ?, ?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE
          device_id = VALUES(device_id),
          app_version = VALUES(app_version),
          locale = VALUES(locale),
          is_active = 1,
          last_seen_at = NOW(),
          updated_at = NOW()
        `,
        [auth.id, platform, token, device_id, app_version, locale]
      );

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}