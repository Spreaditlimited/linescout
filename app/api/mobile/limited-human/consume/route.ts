// app/api/mobile/limited-human/consume/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryOne, exec } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";
function isRouteType(x: any): x is RouteType {
  return x === "machine_sourcing" || x === "white_label" || x === "simple_sourcing";
}

type QuickRow = RowDataPacket & {
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
    const conversation_id = body?.conversation_id != null ? Number(body.conversation_id) : null;

    if (!isRouteType(route_type)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const conv = conversation_id
      ? await queryOne<QuickRow>(
          `
          SELECT id, user_id, route_type, chat_mode, human_message_limit, human_message_used, human_access_expires_at
          FROM linescout_conversations
          WHERE id = ?
            AND user_id = ?
            AND route_type = ?
            AND conversation_kind = 'quick_human'
          LIMIT 1
          `,
          [conversation_id, user.id, route_type]
        )
      : await queryOne<QuickRow>(
          `
          SELECT id, user_id, route_type, chat_mode, human_message_limit, human_message_used, human_access_expires_at
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

    if (!conv) {
      return NextResponse.json({ ok: false, error: "Quick human conversation not found" }, { status: 404 });
    }

    if (conv.chat_mode !== "limited_human") {
      return NextResponse.json({
        ok: true,
        route_type,
        conversation_id: conv.id,
        chat_mode: conv.chat_mode,
        human_message_limit: conv.human_message_limit,
        human_message_used: conv.human_message_used,
        human_access_expires_at: conv.human_access_expires_at,
        ended: true,
      });
    }

    const limit = Number(conv.human_message_limit || 0);
    const used = Number(conv.human_message_used || 0);

    // Count specialist replies currently in this conversation.
    const agentReplyRow = await queryOne<RowDataPacket & { agent_count: number }>(
      `
      SELECT COUNT(*) AS agent_count
      FROM linescout_messages
      WHERE conversation_id = ?
        AND sender_type = 'agent'
      `,
      [conv.id]
    );
    const agentReplyCount = Number(agentReplyRow?.agent_count || 0);
    const diff = Math.max(0, agentReplyCount - used);

    const exp = conv.human_access_expires_at ? Date.parse(conv.human_access_expires_at) : NaN;
    const expired = Number.isFinite(exp) ? Date.now() > exp : false;

    if (expired || (limit > 0 && used >= limit)) {
      await exec(
        `
        UPDATE linescout_conversations
        SET chat_mode = 'ai_only',
            human_message_limit = 0,
            human_message_used = 0,
            human_access_expires_at = NULL,
            updated_at = NOW()
        WHERE id = ? AND user_id = ?
        `,
        [conv.id, user.id]
      );

      return NextResponse.json({
        ok: true,
        route_type,
        conversation_id: conv.id,
        chat_mode: "ai_only",
        human_message_limit: 0,
        human_message_used: 0,
        human_access_expires_at: null,
        ended: true,
      });
    }

    // Consume exactly one newly delivered specialist reply per call.
    // If diff > 1 (historical backlog/sync case), do not auto-burn all remaining quota on reload.
    if (diff === 1) {
      const nextUsed = used + 1;
      const nowExhausted = limit > 0 && nextUsed >= limit;

      if (nowExhausted) {
        await exec(
          `
          UPDATE linescout_conversations
          SET chat_mode = 'ai_only',
              human_message_limit = 0,
              human_message_used = 0,
              human_access_expires_at = NULL,
              updated_at = NOW()
          WHERE id = ? AND user_id = ?
          `,
          [conv.id, user.id]
        );

        return NextResponse.json({
          ok: true,
          route_type,
          conversation_id: conv.id,
          chat_mode: "ai_only",
          human_message_limit: 0,
          human_message_used: 0,
          human_access_expires_at: null,
          ended: true,
        });
      }

      await exec(
        `
        UPDATE linescout_conversations
        SET human_message_used = ?,
            updated_at = NOW()
        WHERE id = ? AND user_id = ?
        `,
        [nextUsed, conv.id, user.id]
      );
      return NextResponse.json({
        ok: true,
        route_type,
        conversation_id: conv.id,
        chat_mode: "limited_human",
        human_message_limit: limit,
        human_message_used: nextUsed,
        human_access_expires_at: conv.human_access_expires_at,
        ended: false,
      });
    }

    return NextResponse.json({
      ok: true,
      route_type,
      conversation_id: conv.id,
      chat_mode: "limited_human",
      human_message_limit: limit,
      human_message_used: used,
      human_access_expires_at: conv.human_access_expires_at,
      ended: false,
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
