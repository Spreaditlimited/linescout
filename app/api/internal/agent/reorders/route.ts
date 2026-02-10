import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAgent() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.username, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );
    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    const role = String(rows[0].role || "");
    if (role !== "agent" && role !== "admin") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }
    return { ok: true as const, userId: Number(rows[0].id), role };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireInternalAgent();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "").trim();

  const conn = await db.getConnection();
  try {
    await ensureReordersTable(conn);

    const params: any[] = [auth.userId];
    let where = "WHERE r.assigned_agent_id = ?";
    if (status) {
      where += " AND r.status = ?";
      params.push(status);
    } else {
      where += " AND r.status IN ('assigned','in_progress')";
    }

    const [rows]: any = await conn.query(
      `
      SELECT r.*, u.email AS user_email
      FROM linescout_reorder_requests r
      JOIN users u ON u.id = r.user_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalAgent();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const reorderId = Number(body?.reorder_id || 0);
  const action = String(body?.action || "").trim().toLowerCase();

  if (!reorderId || !action) {
    return NextResponse.json({ ok: false, error: "reorder_id and action are required" }, { status: 400 });
  }

  const nextStatus =
    action === "start" ? "in_progress" : action === "close" ? "closed" : "";
  if (!nextStatus) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureReordersTable(conn);

    const [rows]: any = await conn.query(
      `
      SELECT id, assigned_agent_id
      FROM linescout_reorder_requests
      WHERE id = ?
      LIMIT 1
      `,
      [reorderId]
    );

    const r = rows?.[0];
    if (!r?.id) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (Number(r.assigned_agent_id) !== auth.userId && auth.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await conn.query(
      `
      UPDATE linescout_reorder_requests
      SET status = ?, closed_at = ${nextStatus === "closed" ? "NOW()" : "closed_at"}
      WHERE id = ?
      LIMIT 1
      `,
      [nextStatus, reorderId]
    );

    return NextResponse.json({ ok: true, status: nextStatus });
  } finally {
    conn.release();
  }
}
