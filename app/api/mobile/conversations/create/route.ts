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
 * POST /api/mobile/conversations/create
 * body: { route_type: "machine_sourcing" | "white_label" }
 *
 * Creates a NEW AI conversation thread (ChatGPT-style).
 * This endpoint MUST NOT be used for paid chats.
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number(u.id);

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
      const [ins]: any = await conn.query(
        `
        INSERT INTO linescout_conversations
          (
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
            'ai_only',
            0,
            0,
            'unpaid',
            'active',
            NOW(),
            NOW()
          )
        `,
        [userId, routeType]
      );

      const conversationId = Number(ins?.insertId || 0);

      if (!conversationId) {
        return NextResponse.json(
          { ok: false, error: "Failed to create conversation" },
          { status: 500 }
        );
      }

      const [rows]: any = await conn.query(
        `SELECT * FROM linescout_conversations WHERE id = ? AND user_id = ? LIMIT 1`,
        [conversationId, userId]
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