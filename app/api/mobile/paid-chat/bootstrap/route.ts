// app/api/mobile/paid-chat/bootstrap/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import {
  buildConversationAccessScope,
  buildProjectVisibilityScope,
  ensureLinescoutProjectAccessInfraOnce,
} from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/paid-chat/bootstrap?handoff_id=123
 * Returns the conversation_id that belongs to this user for that handoff.
 */
export async function GET(req: Request) {
  try {
    const u = await requireAccountUser(req);
    const access = buildConversationAccessScope("c", {
      accountId: Number(u.account_id),
      userId: Number(u.id),
    });
    const visibility = buildProjectVisibilityScope("c", "pa", {
      userId: Number(u.id),
      accountRole: String(u.account_role || "member"),
    });
    await ensureLinescoutProjectAccessInfraOnce();

    const url = new URL(req.url);
    const handoffId = Number(url.searchParams.get("handoff_id") || 0);

    if (!handoffId) {
      return NextResponse.json(
        { ok: false, error: "handoff_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      // Paid chat is tied to a conversation row that has handoff_id set.
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id AS conversation_id,
          c.route_type,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.handoff_id,
          h.status AS handoff_status
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        LEFT JOIN linescout_project_account_access pa
          ON pa.conversation_id = c.id
         AND pa.account_id = ?
        WHERE ${access.sql}
          AND ${visibility.sql}
          AND c.handoff_id = ?
        LIMIT 1
        `,
        [Number(u.account_id), ...access.params, ...visibility.params, handoffId]
      );

      if (!rows?.length) {
        return NextResponse.json(
          { ok: false, error: "Paid chat not found for this handoff." },
          { status: 404 }
        );
      }

      const row = rows[0];

      return NextResponse.json({
        ok: true,
        conversation_id: Number(row.conversation_id),
        route_type: String(row.route_type || "machine_sourcing"),
        chat_mode: String(row.chat_mode || "paid_human"),
        payment_status: String(row.payment_status || "paid"),
        project_status: String(row.project_status || "active"),
        handoff_id: Number(row.handoff_id),
        handoff_status: row.handoff_status ? String(row.handoff_status) : null,
      });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
}
