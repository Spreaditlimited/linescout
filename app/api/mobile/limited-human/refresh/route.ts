import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouteType = "machine_sourcing" | "white_label";

function isRouteType(x: any): x is RouteType {
  return x === "machine_sourcing" || x === "white_label";
}

type ConversationRow = RowDataPacket & {
  id: number;
  user_id: number;
  route_type: RouteType;
  chat_mode: "ai_only" | "limited_human" | "paid_human";
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
};

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const route_type = body?.route_type;

    if (!isRouteType(route_type)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const conv = await queryOne<ConversationRow>(
      `SELECT id, user_id, route_type, chat_mode,
              human_message_limit, human_message_used, human_access_expires_at
       FROM linescout_conversations
       WHERE user_id = ? AND route_type = ?
       LIMIT 1`,
      [user.id, route_type]
    );

    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }

    // If not in limited_human, nothing to do
    if (conv.chat_mode !== "limited_human") {
      return NextResponse.json({
        ok: true,
        route_type,
        chat_mode: conv.chat_mode,
        human_message_limit: conv.human_message_limit,
        human_message_used: conv.human_message_used,
        human_access_expires_at: conv.human_access_expires_at,
        ended: false,
      });
    }

    const limit = Number(conv.human_message_limit || 0);
    const used = Number(conv.human_message_used || 0);
    const exhausted = limit > 0 && used >= limit;

    const exp = conv.human_access_expires_at ? Date.parse(conv.human_access_expires_at) : NaN;
    const expired = Number.isFinite(exp) ? Date.now() > exp : false;

    if (!expired && !exhausted) {
      return NextResponse.json({
        ok: true,
        route_type,
        chat_mode: "limited_human",
        human_message_limit: limit,
        human_message_used: used,
        human_access_expires_at: conv.human_access_expires_at,
        ended: false,
      });
    }

    // Drop back to AI mode
    await queryOne<RowDataPacket>(
      `UPDATE linescout_conversations
       SET chat_mode = 'ai_only',
           human_message_limit = 0,
           human_message_used = 0,
           human_access_expires_at = NULL,
           updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [conv.id, user.id]
    );

    return NextResponse.json({
      ok: true,
      route_type,
      chat_mode: "ai_only",
      human_message_limit: 0,
      human_message_used: 0,
      human_access_expires_at: null,
      ended: true,
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}