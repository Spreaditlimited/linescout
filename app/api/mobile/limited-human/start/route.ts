// app/api/mobile/limited-human/start/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne, exec } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouteType = "machine_sourcing" | "white_label";
function isRouteType(x: any): x is RouteType {
  return x === "machine_sourcing" || x === "white_label";
}

const HUMAN_LIMIT = 6; // you can adjust
const HUMAN_WINDOW_MINUTES = 30; // you can adjust
const COOLDOWN_HOURS = 48;

type ExistingQuick = RowDataPacket & {
  id: number;
  chat_mode: "ai_only" | "limited_human" | "paid_human";
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
  created_at: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);

    const route_type = body?.route_type;
    const source_conversation_id =
      body?.source_conversation_id != null ? Number(body.source_conversation_id) : null;

    if (!isRouteType(route_type)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    // 1) Cooldown check (latest quick_human within 48 hours)
    const cooldown = await queryOne<RowDataPacket & { last_at: string | null }>(
      `
      SELECT MAX(created_at) AS last_at
      FROM linescout_conversations
      WHERE user_id = ?
        AND route_type = ?
        AND conversation_kind = 'quick_human'
      `,
      [user.id, route_type]
    );

    if (cooldown?.last_at) {
      const last = Date.parse(String(cooldown.last_at));
      if (!Number.isNaN(last)) {
        const diffMs = Date.now() - last;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < COOLDOWN_HOURS) {
          const retryAfterHours = Math.ceil(COOLDOWN_HOURS - diffHours);
          return NextResponse.json(
            {
              ok: false,
              code: "LIMITED_HUMAN_COOLDOWN",
              retry_after_hours: retryAfterHours,
              error: "Quick specialist chat is temporarily unavailable due to cooldown.",
            },
            { status: 429 }
          );
        }
      }
    }

    // 2) Reuse an existing active quick_human if it exists and still valid
    const existing = await queryOne<ExistingQuick>(
      `
      SELECT id, chat_mode, human_message_limit, human_message_used, human_access_expires_at, created_at
      FROM linescout_conversations
      WHERE user_id = ?
        AND route_type = ?
        AND conversation_kind = 'quick_human'
        AND project_status = 'active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [user.id, route_type]
    );

    if (existing) {
      const limit = Number(existing.human_message_limit || 0);
      const used = Number(existing.human_message_used || 0);
      const exp = existing.human_access_expires_at ? Date.parse(existing.human_access_expires_at) : NaN;
      const expired = Number.isFinite(exp) ? Date.now() > exp : false;

      const exhausted = limit > 0 && used >= limit;

      if (!expired && !exhausted && existing.chat_mode === "limited_human") {
        return NextResponse.json({
          ok: true,
          route_type,
          conversation_id: existing.id,
          chat_mode: "limited_human",
          human_message_limit: limit,
          human_message_used: used,
          human_access_expires_at: existing.human_access_expires_at,
        });
      }
    }

    // 3) Create a new quick_human conversation
    const expiresAt = new Date(Date.now() + HUMAN_WINDOW_MINUTES * 60 * 1000);

    const insertRes: any = await exec(
      `
      INSERT INTO linescout_conversations
        (user_id, route_type, conversation_kind, source_conversation_id,
         chat_mode, human_message_limit, human_message_used, human_access_expires_at,
         payment_status, project_status, created_at, updated_at)
      VALUES
        (?, ?, 'quick_human', ?, 'limited_human', ?, 0, ?, 'unpaid', 'active', NOW(), NOW())
      `,
      [
        user.id,
        route_type,
        source_conversation_id && Number.isFinite(source_conversation_id) ? source_conversation_id : null,
        HUMAN_LIMIT,
        expiresAt,
      ]
    );

    const newId = Number(insertRes?.insertId || 0);
    if (!newId) {
      return NextResponse.json({ ok: false, error: "Could not start quick specialist chat." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      route_type,
      conversation_id: newId,
      chat_mode: "limited_human",
      human_message_limit: HUMAN_LIMIT,
      human_message_used: 0,
      human_access_expires_at: expiresAt.toISOString(),
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}