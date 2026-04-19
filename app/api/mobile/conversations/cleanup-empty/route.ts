import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildConversationAccessScope } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/conversations/cleanup-empty
 * Deletes ALL empty AI conversations for the signed-in user.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);

    const conn = await db.getConnection();
    try {
      const access = buildConversationAccessScope("c", {
        accountId: Number(user.account_id),
        userId: Number(user.id),
      });
      // Find empty AI conv ids
      const [ids]: any = await conn.query(
        `
        SELECT c.id
        FROM linescout_conversations c
        LEFT JOIN linescout_messages m ON m.conversation_id = c.id
        WHERE ${access.sql}
          AND c.chat_mode IN ('ai_only','limited_human')
          AND c.payment_status = 'unpaid'
          AND c.handoff_id IS NULL
        GROUP BY c.id
        HAVING COUNT(m.id) = 0
        ORDER BY c.updated_at DESC
        LIMIT 500
        `,
        [...access.params]
      );

      const list = (ids || []).map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (list.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

      const [del]: any = await conn.query(
        `DELETE c FROM linescout_conversations c WHERE ${access.sql} AND c.id IN (${list.map(() => "?").join(",")})`,
        [...access.params, ...list]
      );

      return NextResponse.json({ ok: true, deleted: Number(del?.affectedRows || 0) });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
