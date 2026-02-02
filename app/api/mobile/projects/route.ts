// app/api/mobile/projects/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouteType = "machine_sourcing" | "white_label";

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
    const user = await requireUser(req);

    const rows = await queryRows<ConversationRow>(
      `
      SELECT
        c.id,
        c.route_type,
        c.project_status,
        c.handoff_id,
        c.updated_at,
        h.status AS handoff_status
      FROM linescout_conversations c
      LEFT JOIN linescout_handoffs h
        ON h.id = c.handoff_id
      WHERE c.user_id = ?
        AND c.handoff_id IS NOT NULL
      ORDER BY c.updated_at DESC
      LIMIT 50
      `,
      [user.id]
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
      };
    });

    return NextResponse.json({ ok: true, projects });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}