import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label";
}

/**
 * GET /api/mobile/conversations/list?route_type=machine_sourcing
 *
 * Returns the user's conversation threads (ChatGPT-style).
 * Includes AI + Limited + Paid conversations for the given route_type.
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

    const url = new URL(req.url);
    const routeType = (url.searchParams.get("route_type") || "machine_sourcing") as RouteType;

    if (!isValidRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      /**
       * Last message per conversation (by max(id)).
       * sort_at ensures correct ordering even if c.updated_at is not maintained perfectly.
       */
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.route_type,
          c.chat_mode,
          c.payment_status,
          c.project_status,
          c.handoff_id,
          c.updated_at,
          c.created_at,
          lm.message_text AS last_message_text,
          lm.created_at AS last_message_at,
          COALESCE(lm.created_at, c.updated_at, c.created_at) AS sort_at
        FROM linescout_conversations c
        LEFT JOIN (
          SELECT m1.conversation_id, m1.message_text, m1.created_at
          FROM linescout_messages m1
          JOIN (
            SELECT conversation_id, MAX(id) AS max_id
            FROM linescout_messages
            GROUP BY conversation_id
          ) x
            ON x.conversation_id = m1.conversation_id
           AND x.max_id = m1.id
        ) lm
          ON lm.conversation_id = c.id
        WHERE c.user_id = ?
          AND c.route_type = ?
        ORDER BY sort_at DESC, c.id DESC
        LIMIT 80
        `,
        [userId, routeType]
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}