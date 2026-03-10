import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.route_type,
          c.chat_mode,
          c.project_status,
          c.human_message_limit,
          c.human_message_used,
          c.human_access_expires_at,
          c.updated_at,
          c.created_at,
          (
            SELECT m.message_text
            FROM linescout_messages m
            WHERE m.conversation_id = c.id
              AND m.message_text IS NOT NULL
              AND TRIM(m.message_text) <> ''
            ORDER BY m.id DESC
            LIMIT 1
          ) AS last_message_text,
          (
            SELECT m.created_at
            FROM linescout_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC
            LIMIT 1
          ) AS last_message_at
        FROM linescout_conversations c
        WHERE c.user_id = ?
          AND c.conversation_kind = 'quick_human'
          AND c.chat_mode = 'limited_human'
          AND c.project_status = 'active'
          AND (c.human_access_expires_at IS NULL OR c.human_access_expires_at > NOW())
          AND (c.human_message_limit = 0 OR c.human_message_used < c.human_message_limit)
        ORDER BY COALESCE(
          (
            SELECT m.created_at
            FROM linescout_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.id DESC
            LIMIT 1
          ),
          c.updated_at,
          c.created_at
        ) DESC,
        c.id DESC
        LIMIT 80
        `,
        [Number(user.id)]
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
