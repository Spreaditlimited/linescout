// app/api/mobile/limited-human/start/route.ts
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
  updated_at: string; // existing column
};

// Tune these as you like
const HUMAN_MESSAGE_LIMIT = 6;
const HUMAN_ACCESS_MINUTES = 15;

// Cooldown: one limited human session per route every 48 hours
const COOLDOWN_MS = 48 * 60 * 60 * 1000;
const BLOG_URL = "https://www.sureimports.com/blog";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const route_type = body?.route_type;

    if (!isRouteType(route_type)) {
      return NextResponse.json(
        { ok: false, error: "Invalid route_type" },
        { status: 400 }
      );
    }

    const conv = await queryOne<ConversationRow>(
      `SELECT id, user_id, route_type, chat_mode,
              human_message_limit, human_message_used, human_access_expires_at,
              updated_at
       FROM linescout_conversations
       WHERE user_id = ? AND route_type = ?
       LIMIT 1`,
      [user.id, route_type]
    );

    if (!conv) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    // If already in limited human, just return current state (no new session created)
    if (conv.chat_mode === "limited_human") {
      return NextResponse.json({
        ok: true,
        route_type,
        chat_mode: "limited_human",
        human_message_limit: conv.human_message_limit,
        human_message_used: conv.human_message_used,
        human_access_expires_at: conv.human_access_expires_at,
      });
    }

    // 48-hour cooldown enforcement:
    // We treat "updated_at" as the timestamp of the last mode reset/end,
    // because consume/refresh set updated_at = NOW() when dropping to ai_only.
    const updatedAtMs = Date.parse(conv.updated_at);
    const withinCooldown =
      Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < COOLDOWN_MS;

    if (withinCooldown) {
      const remainingMs = COOLDOWN_MS - (Date.now() - updatedAtMs);
      const retryAfterHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));

      return NextResponse.json(
        {
          ok: false,
          code: "LIMITED_HUMAN_COOLDOWN",
          retry_after_hours: retryAfterHours,
          blog_url: BLOG_URL,
          error:
            "Quick specialist chat is temporarily unavailable. You recently spoke with a sourcing specialist for this project. " +
            "To keep our specialists available for everyone, we allow one quick human chat per project every 48 hours. " +
            "You can continue chatting with LineScout AI, or learn more here: https://www.sureimports.com/blog",
        },
        { status: 403 }
      );
    }

    // Enable limited human
    await queryOne<RowDataPacket>(
      `UPDATE linescout_conversations
       SET chat_mode = 'limited_human',
           human_message_limit = ?,
           human_message_used = 0,
           human_access_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
           updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [HUMAN_MESSAGE_LIMIT, HUMAN_ACCESS_MINUTES, conv.id, user.id]
    );

    const refreshed = await queryOne<ConversationRow>(
      `SELECT id, user_id, route_type, chat_mode,
              human_message_limit, human_message_used, human_access_expires_at,
              updated_at
       FROM linescout_conversations
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [conv.id, user.id]
    );

    return NextResponse.json({
      ok: true,
      route_type,
      chat_mode: refreshed?.chat_mode ?? "limited_human",
      human_message_limit: refreshed?.human_message_limit ?? HUMAN_MESSAGE_LIMIT,
      human_message_used: refreshed?.human_message_used ?? 0,
      human_access_expires_at: refreshed?.human_access_expires_at ?? null,
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}