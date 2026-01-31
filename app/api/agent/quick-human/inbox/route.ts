// app/api/agent/quick-human/inbox/route.ts
import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth";
import { queryRows } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAgent(req);

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") || 50);
    const limit = Math.max(10, Math.min(200, limitRaw));
    const cursor = Number(url.searchParams.get("cursor") || 0);

    const params: any[] = [];

    let where = `
      c.conversation_kind = 'quick_human'
      AND c.project_status = 'active'
    `;

    if (cursor > 0) {
      where += ` AND c.id < ?`;
      params.push(cursor);
    }

    const items = await queryRows<any>(
      `
      SELECT
        c.id AS conversation_id,
        c.id AS id,

        c.user_id,
        c.route_type,
        c.chat_mode,
        c.project_status,

        c.human_message_limit,
        c.human_message_used,
        c.human_access_expires_at,

        c.created_at,
        c.updated_at,

        lm.id AS last_message_id,
        lm.sender_type AS last_sender_type,
        lm.message_text AS last_message_text,
        lm.created_at AS last_message_at,

        CASE
          WHEN COALESCE(lm.sender_type, '') = 'user' THEN 1
          ELSE 0
        END AS is_unread

      FROM linescout_conversations c

      LEFT JOIN (
        SELECT m1.*
        FROM linescout_messages m1
        JOIN (
          SELECT conversation_id, MAX(id) AS max_id
          FROM linescout_messages
          GROUP BY conversation_id
        ) mm ON mm.conversation_id = m1.conversation_id AND mm.max_id = m1.id
      ) lm ON lm.conversation_id = c.id

      WHERE ${where}
      ORDER BY COALESCE(lm.id, 0) DESC, c.updated_at DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    const nextCursor = items?.length ? Number(items[items.length - 1].conversation_id) : null;

    return NextResponse.json({ ok: true, items: items || [], next_cursor: nextCursor });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}