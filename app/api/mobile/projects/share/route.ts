import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import {
  buildConversationAccessScope,
  ensureLinescoutProjectAccessInfraOnce,
} from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Visibility = "owner_only" | "team";

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const role = String(user.account_role || "member");
    if (role !== "owner") {
      return NextResponse.json(
        { ok: false, error: "Only account owners can manage project visibility." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const handoffId = Number(body?.handoff_id || 0);
    const conversationId = Number(body?.conversation_id || 0);
    const visibilityRaw = String(body?.visibility || "").trim().toLowerCase();
    const visibility: Visibility = visibilityRaw === "team" ? "team" : "owner_only";

    if (!handoffId && !conversationId) {
      return NextResponse.json(
        { ok: false, error: "handoff_id or conversation_id is required" },
        { status: 400 }
      );
    }

    await ensureLinescoutProjectAccessInfraOnce();

    const access = buildConversationAccessScope("c", {
      accountId: Number(user.account_id),
      userId: Number(user.id),
    });

    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT c.id, c.handoff_id, c.chat_mode, c.payment_status
        FROM linescout_conversations c
        WHERE ${handoffId ? "c.handoff_id = ?" : "c.id = ?"}
          AND ${access.sql}
        LIMIT 1
        `,
        [handoffId || conversationId, ...access.params]
      );

      const conversation = rows?.[0];
      if (!conversation?.id) {
        return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
      }

      if (
        String(conversation.chat_mode || "") !== "paid_human" ||
        String(conversation.payment_status || "") !== "paid" ||
        !conversation.handoff_id
      ) {
        return NextResponse.json(
          { ok: false, error: "Only paid projects can be shared." },
          { status: 400 }
        );
      }

      await conn.query(
        `
        INSERT INTO linescout_project_account_access
          (conversation_id, account_id, visibility, updated_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          visibility = VALUES(visibility),
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = NOW()
        `,
        [Number(conversation.id), Number(user.account_id), visibility, Number(user.id)]
      );

      return NextResponse.json({
        ok: true,
        conversation_id: Number(conversation.id),
        handoff_id: Number(conversation.handoff_id || 0) || null,
        visibility,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
