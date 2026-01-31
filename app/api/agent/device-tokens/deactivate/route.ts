// app/api/agent/device-tokens/deactivate/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      `
      SELECT
        u.id,
        u.role,
        u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
        AND u.is_active = 1
      LIMIT 1
      `,
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
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => null);
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await conn.query(
        `
        UPDATE linescout_agent_device_tokens
        SET is_active = 0,
            updated_at = NOW()
        WHERE agent_id = ?
          AND token = ?
        LIMIT 1
        `,
        [auth.id, token]
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