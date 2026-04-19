import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import { buildConversationAccessScope } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

/**
 * POST /api/mobile/conversations/create
 * body: { route_type: "machine_sourcing" | "white_label" | "simple_sourcing" }
 *
 * Creates a NEW AI conversation thread (ChatGPT-style).
 * This endpoint MUST NOT be used for paid chats.
 */
export async function POST(req: Request) {
  try {
    const u = await requireAccountUser(req);
    const userId = Number(u.id);
    const accountId = Number(u.account_id);

    const body = await req.json().catch(() => ({}));
    const routeType = body?.route_type;

    if (!isValidRouteType(routeType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid route_type" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      const access = buildConversationAccessScope("c", {
        accountId,
        userId,
      });

      const [existingRows]: any = await conn.query(
        `
        SELECT c.*
        FROM linescout_conversations c
        LEFT JOIN linescout_messages m ON m.conversation_id = c.id
        WHERE ${access.sql}
          AND c.route_type = ?
          AND c.chat_mode = 'ai_only'
          AND c.payment_status = 'unpaid'
          AND c.handoff_id IS NULL
          AND (c.conversation_kind IS NULL OR c.conversation_kind = 'ai')
        GROUP BY c.id
        HAVING COUNT(m.id) = 0
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT 1
        `,
        [...access.params, routeType]
      );

      if (existingRows?.length) {
        return NextResponse.json({
          ok: true,
          conversation: existingRows[0],
          reused: true,
        });
      }

      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_conversations
          (
            account_id,
            user_id,
            route_type,
            chat_mode,
            human_message_limit,
            human_message_used,
            payment_status,
            project_status,
            created_at,
            updated_at
          )
        VALUES
          (
            ?,
            ?,
            ?,
            'ai_only',
            0,
            0,
            'unpaid',
            'active',
            NOW(),
            NOW()
          )
        `,
        [accountId, userId, routeType]
      );

      const conversationId = Number(ins?.insertId || 0);

      if (!conversationId) {
        return NextResponse.json(
          { ok: false, error: "Failed to create conversation" },
          { status: 500 }
        );
      }

      const postInsertAccess = buildConversationAccessScope("c", {
        accountId,
        userId,
      });
      const [rows]: any = await conn.query(
        `SELECT * FROM linescout_conversations c WHERE c.id = ? AND ${postInsertAccess.sql} LIMIT 1`,
        [conversationId, ...postInsertAccess.params]
      );

      return NextResponse.json({
        ok: true,
        conversation: rows?.[0] || null,
      });
    } catch (e: any) {
      console.error(
        "POST /api/mobile/conversations/create error:",
        e?.message || e
      );
      return NextResponse.json(
        { ok: false, error: "Failed to create conversation" },
        { status: 500 }
      );
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
