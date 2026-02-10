import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";
import { sendNoticeEmail } from "@/lib/notice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
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
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };
    return { ok: true as const };
  } finally {
    conn.release();
  }
}

async function sendExpoPush(tokens: string[], payload: { title: string; body: string; data?: any }) {
  const clean = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!clean.length) return;

  const messages = clean.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  }).catch(() => {});
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const reorderId = Number(body?.reorder_id || 0);
  const agentId = Number(body?.agent_id || 0);
  const adminNote = String(body?.admin_note || "").trim();

  if (!reorderId || !agentId) {
    return NextResponse.json({ ok: false, error: "reorder_id and agent_id are required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureReordersTable(conn);

    const [agentRows]: any = await conn.query(
      `
      SELECT u.id, u.is_active, ap.approval_status, ap.email, ap.email_notifications_enabled
      FROM internal_users u
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [agentId]
    );
    const agent = agentRows?.[0];
    if (!agent?.id || Number(agent.is_active) !== 1 || String(agent.approval_status || "") !== "approved") {
      return NextResponse.json({ ok: false, error: "Agent is not active or approved." }, { status: 400 });
    }

    const [rows]: any = await conn.query(
      `
      SELECT r.*, u.email AS user_email
      FROM linescout_reorder_requests r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = ?
      LIMIT 1
      `,
      [reorderId]
    );
    const r = rows?.[0];
    if (!r?.id) {
      return NextResponse.json({ ok: false, error: "Reorder not found." }, { status: 404 });
    }
    if (String(r.status || "") === "closed") {
      return NextResponse.json({ ok: false, error: "Reorder already closed." }, { status: 409 });
    }

    await conn.query(
      `
      UPDATE linescout_reorder_requests
      SET assigned_agent_id = ?, status = 'assigned', admin_note = ?, assigned_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [agentId, adminNote || null, reorderId]
    );

    if (r?.new_conversation_id) {
      await conn.query(
        `
        UPDATE linescout_conversations
        SET assigned_agent_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
        `,
        [agentId, Number(r.new_conversation_id)]
      );
    }

    // Notify agent
    try {
      const agentEmail = String(agent.email || "").trim();
      if (agentEmail && Number(agent.email_notifications_enabled ?? 1) === 1) {
        await sendNoticeEmail({
          to: agentEmail,
          subject: "Re-order assigned to you",
          title: "New re-order assigned",
          lines: [
            `Reorder ID: ${reorderId}`,
            `Project ID: ${r.conversation_id}`,
            "Open the agent app to follow up.",
          ],
          footerNote: "This email was sent because a re-order was assigned to you on LineScout.",
        });
      }
    } catch {}

    try {
      const [tokenRows]: any = await conn.query(
        `
        SELECT token
        FROM linescout_agent_device_tokens
        WHERE is_active = 1 AND agent_id = ?
        `,
        [agentId]
      );
      const tokens = (tokenRows || []).map((t: any) => String(t.token || "")).filter(Boolean);
      await sendExpoPush(tokens, {
        title: "New re-order assigned",
        body: "A customer requested a re-order. Open to follow up.",
        data: { kind: "reorder", reorder_id: reorderId, conversation_id: r.conversation_id },
      });
    } catch {}

    // Notify user
    try {
      const userEmail = String(r.user_email || "").trim();
      if (userEmail) {
        await sendNoticeEmail({
          to: userEmail,
          subject: "Your re-order has been assigned",
          title: "Re-order assigned",
          lines: [
            "Your re-order request has been assigned to a specialist.",
            "They will reach out with next steps shortly.",
          ],
          footerNote: "This email was sent because your re-order was assigned on LineScout.",
        });
      }
    } catch {}

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
