// app/api/mobile/paid-chat/get/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/paid-chat/get?handoff_id=123
 * GET /api/mobile/paid-chat/get?conversation_id=456
 *
 * Returns the paid conversation row if it belongs to the signed-in user.
 * Supports resolving handoff_id -> conversation_id.
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any).id || 0);

    const url = new URL(req.url);
    const handoffId = Number(url.searchParams.get("handoff_id") || 0);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);

    if (!handoffId && !conversationId) {
      return NextResponse.json(
        { ok: false, error: "handoff_id or conversation_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      let row: any = null;

      if (handoffId) {
        const [rows]: any = await conn.query(
          `
          SELECT c.*
          FROM linescout_handoffs h
          JOIN linescout_conversations c ON c.id = h.conversation_id
          WHERE h.id = ?
            AND c.user_id = ?
          LIMIT 1
          `,
          [handoffId, userId]
        );
        row = rows?.[0] || null;
      } else {
        const [rows]: any = await conn.query(
          `
          SELECT *
          FROM linescout_conversations
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
          `,
          [conversationId, userId]
        );
        row = rows?.[0] || null;
      }

      if (!row?.id) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, conversation: row });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}