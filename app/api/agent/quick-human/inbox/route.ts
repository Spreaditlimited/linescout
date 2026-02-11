// app/api/agent/quick-human/inbox/route.ts
import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth";
import { queryOne, queryRows } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

const APPROVAL_MESSAGE =
  "Thank you for creating an account. Please go to your settings to complete all required sections. Our account approval team will review and approve your account so you can start claiming projects.";

type PermissionRow = RowDataPacket & { can_view_handoffs: number };

async function ensureApprovedAgent(userId: number, role: string) {
  if (role === "admin") return true;
  const row = await queryOne<PermissionRow>(
    `
    SELECT COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
    FROM internal_users u
    LEFT JOIN internal_user_permissions p ON p.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );
  return !!row?.can_view_handoffs;
}

export async function GET(req: Request) {
  try {
    const agent = await requireAgent(req);
    const approved = await ensureApprovedAgent(Number(agent.id), String(agent.role || ""));
    if (!approved) {
      return NextResponse.json(
        { ok: false, error: "ACCOUNT_APPROVAL_REQUIRED", approval_required: true, message: APPROVAL_MESSAGE },
        { status: 403 }
      );
    }

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
        COALESCE(
          NULLIF(
            SUBSTRING_INDEX(
              TRIM((
              SELECT l.name
              FROM linescout_leads l
              WHERE l.email = u.email
                AND LOWER(TRIM(COALESCE(l.name, ''))) <> 'unknown'
              ORDER BY l.created_at DESC
              LIMIT 1
              )),
              ' ',
              1
            ),
            ''
          ),
          NULLIF(SUBSTRING_INDEX(TRIM(u.display_name), ' ', 1), ''),
          'Customer'
        ) AS customer_name,
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
      LEFT JOIN users u ON u.id = c.user_id

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
