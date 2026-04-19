// app/api/mobile/projects/route.ts
import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import {
  buildConversationAccessScope,
  buildProjectVisibilityScope,
  ensureLinescoutProjectAccessInfraOnce,
} from "@/lib/accounts";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

// This is what the drawer needs for Projects.
// NOTE: "stage" comes from linescout_handoffs.status (pending, claimed, etc.)
type ConversationRow = RowDataPacket & {
  id: number;
  route_type: RouteType;
  project_status: "active" | "cancelled"; // DB: linescout_conversations.project_status
  handoff_id: number | null;
  updated_at: string;

  // From handoff join
  handoff_status: string | null;
};

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    await ensureLinescoutProjectAccessInfraOnce();
    const access = buildConversationAccessScope("c", {
      accountId: Number(user.account_id),
      userId: Number(user.id),
    });
    const visibility = buildProjectVisibilityScope("c", "pa", {
      userId: Number(user.id),
      accountRole: String(user.account_role || "member"),
    });

    const rows = await queryRows<ConversationRow>(
      `
      SELECT
        c.id,
        c.route_type,
        c.project_status,
        c.handoff_id,
        c.updated_at,
        h.status AS handoff_status,
        COALESCE(pa.visibility, 'owner_only') AS team_visibility
      FROM linescout_conversations c
      LEFT JOIN linescout_handoffs h
        ON h.id = c.handoff_id
      LEFT JOIN linescout_project_account_access pa
        ON pa.conversation_id = c.id
       AND pa.account_id = ?
      WHERE ${access.sql}
        AND ${visibility.sql}
        AND c.handoff_id IS NOT NULL
        AND c.chat_mode = 'paid_human'
        AND c.payment_status = 'paid'
      ORDER BY c.updated_at DESC
      LIMIT 50
      `,
      [Number(user.account_id), ...access.params, ...visibility.params]
    );

    const projects = (rows || []).map((r) => {
      const handoffId = typeof r.handoff_id === "number" ? r.handoff_id : null;

      // A "project" is simply: it has a handoff_id. Stage comes from handoff_status.
      // We stop inventing "Active" as a stage.
      const stage = (r.handoff_status || "").trim() || null;

      return {
        route_type: r.route_type,
        conversation_id: r.id,

        // Keep existing field (some UI already depends on it)
        conversation_status: r.project_status,

        handoff_id: handoffId,

        // NEW: real project stage for UI (pending, claimed, etc.)
        stage,

        // Routing should be based on handoff_id presence, not on "active"
        has_active_project: Boolean(handoffId),

        updated_at: r.updated_at,
        team_visibility: String((r as any).team_visibility || "owner_only"),
      };
    });

    return NextResponse.json({ ok: true, projects });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
