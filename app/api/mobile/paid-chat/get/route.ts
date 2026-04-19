// app/api/mobile/paid-chat/get/route.ts
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
 * GET /api/mobile/paid-chat/get?handoff_id=123
 * GET /api/mobile/paid-chat/get?conversation_id=456
 *
 * Returns the paid conversation row if it belongs to the signed-in user.
 * Supports resolving handoff_id -> conversation_id.
 */
export async function GET(req: Request) {
  try {
    const u = await requireAccountUser(req);
    const userId = Number((u as any).id || 0);
    const access = buildConversationAccessScope("c", {
      accountId: Number((u as any).account_id || 0),
      userId,
    });
    const visibility = buildProjectVisibilityScope("c", "pa", {
      userId,
      accountRole: String((u as any).account_role || "member"),
    });
    await ensureLinescoutProjectAccessInfraOnce();

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
          LEFT JOIN linescout_project_account_access pa
            ON pa.conversation_id = c.id
           AND pa.account_id = ?
          WHERE h.id = ?
            AND ${access.sql}
            AND ${visibility.sql}
          LIMIT 1
          `,
          [Number((u as any).account_id || 0), handoffId, ...access.params, ...visibility.params]
        );
        row = rows?.[0] || null;
      } else {
        const [rows]: any = await conn.query(
          `
          SELECT c.*
          FROM linescout_conversations c
          LEFT JOIN linescout_project_account_access pa
            ON pa.conversation_id = c.id
           AND pa.account_id = ?
          WHERE c.id = ?
            AND ${access.sql}
            AND ${visibility.sql}
          LIMIT 1
          `,
          [Number((u as any).account_id || 0), conversationId, ...access.params, ...visibility.params]
        );
        row = rows?.[0] || null;

        if (row && (row.handoff_id == null || String(row.chat_mode || "") !== "paid_human")) {
          row = null;
        }
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
