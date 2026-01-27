import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAccess() {
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
      `SELECT u.id, u.role, u.is_active, COALESCE(p.can_view_leads,0) AS can_view_leads
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) return { ok: true as const, userId, role };
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);
  const lastSeenId = Number(body?.last_seen_message_id || 0);

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }
  if (!lastSeenId) {
    return NextResponse.json({ ok: false, error: "last_seen_message_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    // respect assignment: admin bypass, agents only assigned/unassigned
    const [convRows]: any = await conn.query(
      `SELECT assigned_agent_id, chat_mode, payment_status, project_status
       FROM linescout_conversations
       WHERE id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!convRows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const c = convRows[0];
    if (String(c.chat_mode) !== "paid_human" || String(c.payment_status) !== "paid") {
      return NextResponse.json({ ok: false, error: "Paid chat is not enabled." }, { status: 403 });
    }
    if (String(c.project_status) === "cancelled") {
      return NextResponse.json({ ok: false, error: "This project is cancelled." }, { status: 403 });
    }

    const assigned = c.assigned_agent_id == null ? null : Number(c.assigned_agent_id);
    if (auth.role !== "admin" && assigned && assigned !== auth.userId) {
      return NextResponse.json({ ok: false, error: "You are not assigned to this conversation." }, { status: 403 });
    }

    await conn.query(
      `INSERT INTO linescout_conversation_reads
         (conversation_id, internal_user_id, last_seen_message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_seen_message_id = GREATEST(last_seen_message_id, VALUES(last_seen_message_id)),
         updated_at = CURRENT_TIMESTAMP`,
      [conversationId, auth.userId, lastSeenId]
    );

    return NextResponse.json({ ok: true, conversation_id: conversationId, last_seen_message_id: lastSeenId });
  } finally {
    conn.release();
  }
}