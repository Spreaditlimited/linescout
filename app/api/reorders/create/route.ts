import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";
import { sendNoticeEmail } from "@/lib/notice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: any) {
  return String(value ?? "").trim();
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
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id || 0);
    const userNote = normalizeText(body?.user_note);

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureReordersTable(conn);

      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.route_type,
          c.handoff_id,
          c.assigned_agent_id,
          h.status AS handoff_status,
          h.delivered_at
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, user.id]
      );

      const c = rows?.[0];
      if (!c?.id || !c?.handoff_id) {
        return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
      }

      const status = String(c.handoff_status || "").trim().toLowerCase();
      const isDelivered = status === "delivered" || !!c.delivered_at;
      if (!isDelivered) {
        return NextResponse.json(
          { ok: false, error: "Re-order is only available for delivered projects." },
          { status: 400 }
        );
      }

      const [openRows]: any = await conn.query(
        `
        SELECT id
        FROM linescout_reorder_requests
        WHERE conversation_id = ?
          AND status IN ('pending_agent','pending_admin','assigned','in_progress')
        LIMIT 1
        `,
        [conversationId]
      );

      if (openRows?.length) {
        return NextResponse.json(
          { ok: false, error: "A re-order request is already active for this project." },
          { status: 409 }
        );
      }

      const originalAgentId = Number(c.assigned_agent_id || 0) || null;

      let assignedAgentId: number | null = null;
      let assignedAgentEmail: string | null = null;
      let agentEmailNotifications = false;
      let agentActive = false;

      if (originalAgentId) {
        const [agentRows]: any = await conn.query(
          `
          SELECT u.id, u.is_active, ap.approval_status, ap.email, ap.email_notifications_enabled
          FROM internal_users u
          LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
          WHERE u.id = ?
          LIMIT 1
          `,
          [originalAgentId]
        );
        const a = agentRows?.[0];
        if (a?.id && Number(a.is_active) === 1 && String(a.approval_status || "") === "approved") {
          agentActive = true;
          assignedAgentId = Number(a.id);
          assignedAgentEmail = normalizeText(a.email) || null;
          agentEmailNotifications = Number(a.email_notifications_enabled ?? 1) === 1;
        }
      }

      const statusOut = agentActive ? "assigned" : "pending_admin";

      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_reorder_requests
          (user_id, conversation_id, handoff_id, route_type, status, original_agent_id, assigned_agent_id, user_note, assigned_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(user.id),
          conversationId,
          Number(c.handoff_id),
          String(c.route_type || "machine_sourcing"),
          statusOut,
          originalAgentId,
          assignedAgentId,
          userNote || null,
          assignedAgentId ? new Date() : null,
        ]
      );

      const reorderId = Number(ins?.insertId || 0);

      // User confirmation email
      try {
        await sendNoticeEmail({
          to: user.email,
          subject: "Re-order request received",
          title: "Your re-order is in progress",
          lines: [
            "We have received your re-order request.",
            assignedAgentId
              ? "Your original sourcing specialist has been notified."
              : "Our admin team will assign your request to a specialist.",
          ],
          footerNote: "This email was sent because you submitted a re-order request on LineScout.",
        });
      } catch {}

      // User push (mobile)
      try {
        const [userTokensRows]: any = await conn.query(
          `
          SELECT token
          FROM linescout_device_tokens
          WHERE is_active = 1 AND user_id = ?
          `,
          [Number(user.id)]
        );
        const userTokens = (userTokensRows || []).map((r: any) => String(r.token || "")).filter(Boolean);
        await sendExpoPush(userTokens, {
          title: "Re-order received",
          body: "We received your re-order request and will follow up shortly.",
          data: { kind: "reorder", reorder_id: reorderId, conversation_id: conversationId },
        });
      } catch {}

      // Notify agent if assigned
      if (assignedAgentId) {
        try {
          if (agentEmailNotifications && assignedAgentEmail) {
            await sendNoticeEmail({
              to: assignedAgentEmail,
              subject: "New re-order request",
              title: "New re-order assigned to you",
              lines: [
                `Project ID: ${conversationId}`,
                "A customer has requested to re-order a delivered project.",
                "Open the agent app to follow up.",
              ],
              footerNote: "This email was sent because a re-order was assigned to you on LineScout.",
            });
          }
        } catch {}

        try {
          const [tokensRows]: any = await conn.query(
            `
            SELECT token
            FROM linescout_agent_device_tokens
            WHERE is_active = 1 AND agent_id = ?
            `,
            [assignedAgentId]
          );
          const tokens = (tokensRows || []).map((r: any) => String(r.token || "")).filter(Boolean);
          await sendExpoPush(tokens, {
            title: "New re-order request",
            body: "A customer requested a re-order on a delivered project.",
            data: { kind: "reorder", reorder_id: reorderId, conversation_id: conversationId },
          });
        } catch {}
      } else {
        // Notify admin if no active agent
        try {
          await sendNoticeEmail({
            to: "sureimporters@gmail.com",
            subject: "Re-order request needs assignment",
            title: "Re-order pending admin assignment",
            lines: [
              `Reorder ID: ${reorderId}`,
              `Project ID: ${conversationId}`,
              "The original agent is inactive or unassigned.",
              "Assign this re-order to an active agent.",
            ],
            footerNote: "This email was sent because a re-order requires admin assignment.",
          });
        } catch {}
      }

      return NextResponse.json({
        ok: true,
        reorder_id: reorderId,
        status: statusOut,
        assigned_agent_id: assignedAgentId,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
