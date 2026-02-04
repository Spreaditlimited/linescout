import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }
  const h = await headers();
  const cookieHeader = h.get("cookie") || "";
  const token =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Admin access required" };
    return { ok: true as const, userId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!requestId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const status = String(body?.status || "").trim().toLowerCase();
  const channel = String(body?.admin_response_channel || "").trim().toLowerCase();
  const note = String(body?.admin_note || "").trim();

  const validStatus = new Set(["pending", "reviewed", "resolved"]);
  const validChannel = new Set(["", "email", "whatsapp", "phone"]);
  if (!validStatus.has(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }
  if (!validChannel.has(channel)) {
    return NextResponse.json({ ok: false, error: "Invalid response channel" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [res]: any = await conn.query(
      `
      UPDATE linescout_agent_support_requests
      SET status = ?,
          admin_response_channel = ?,
          admin_note = ?,
          updated_by_internal_user_id = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [status, channel || null, note || null, auth.userId, requestId]
    );
    if (!res?.affectedRows) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
