// app/api/mobile/projects/summary/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/projects/summary?conversation_id=123
 * - Signed-in users only
 * - Returns a short, safe summary STRING for user confidence (not full transcript)
 *
 * Response:
 * { ok: true, conversation_id: number, stage: string, summary: string | null }
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const url = new URL(req.url);
    const conversationId = Number(url.searchParams.get("conversation_id") || 0);

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const conn = await db.getConnection();
    try {
      // 1) Confirm ownership + paid project
      const [rows]: any = await conn.query(
        `
        SELECT
          c.id,
          c.user_id,
          c.route_type,
          c.chat_mode,
          c.payment_status,
          c.handoff_id,
          h.status AS handoff_status
        FROM linescout_conversations c
        LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1
        `,
        [conversationId, user.id]
      );

      const c = rows?.[0];
      if (!c?.id) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }

      // Keep your rule: summary is only for paid projects
      if (c.chat_mode !== "paid_human" || c.payment_status !== "paid" || !c.handoff_id) {
        return NextResponse.json(
          { ok: false, error: "Summary is only available for paid projects." },
          { status: 400 }
        );
      }

      // 2) Pull a lightweight snapshot from messages (first user + last user + last agent)
      const [msgs]: any = await conn.query(
        `
        SELECT sender_type, message_text, created_at
        FROM linescout_messages
        WHERE conversation_id = ?
        ORDER BY id ASC
        LIMIT 200
        `,
        [conversationId]
      );

      const items = Array.isArray(msgs) ? msgs : [];

      const firstUser =
        items.find((m) => m?.sender_type === "user")?.message_text || "";

      const lastUser =
        [...items].reverse().find((m) => m?.sender_type === "user")?.message_text || "";

      const lastAgent =
        [...items].reverse().find((m) => m?.sender_type === "agent")?.message_text || "";

      const clip = (t: string, max = 220) => {
        const s = String(t || "").trim().replace(/\s+/g, " ");
        if (!s) return "";
        return s.length > max ? s.slice(0, max).trim() + "…" : s;
      };

      const stage = String(c.handoff_status || "").trim() || "pending";

      const goal = clip(firstUser, 240);
      const lastC = clip(lastUser, 240);
      const lastA = clip(lastAgent, 240);

      const parts: string[] = [];
      if (goal) parts.push(`Customer goal: ${goal}`);
      if (lastA) parts.push(`Latest agent update: ${lastA}`);
      if (lastC && lastC !== goal) parts.push(`Latest customer note: ${lastC}`);

      const summaryText = parts.join("\n\n") || null;

      return NextResponse.json({
        ok: true,
        conversation_id: conversationId,
        stage,
        summary: summaryText,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}