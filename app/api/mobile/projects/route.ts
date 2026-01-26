// app/api/mobile/projects/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouteType = "machine_sourcing" | "white_label";

type ConversationRow = RowDataPacket & {
  id: number;
  route_type: RouteType;
  project_status: "active" | "cancelled"; // DB field: linescout_conversations.project_status
  handoff_id: number | null;
  updated_at: string;
};

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const rows = await queryRows<ConversationRow>(
      `SELECT id, route_type, project_status, handoff_id, updated_at
       FROM linescout_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 10`,
      [user.id]
    );

    const projects = (rows || []).map((r) => {
      const hasActiveProject =
        r.project_status === "active" && typeof r.handoff_id === "number";

      return {
        route_type: r.route_type,
        conversation_id: r.id,
        // API name: conversation_status (maps to DB project_status)
        conversation_status: r.project_status,
        handoff_id: typeof r.handoff_id === "number" ? r.handoff_id : null,
        has_active_project: hasActiveProject,
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