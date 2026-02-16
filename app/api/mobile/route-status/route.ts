import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isRouteType(x: string | null): x is RouteType {
  return x === "machine_sourcing" || x === "white_label" || x === "simple_sourcing";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const routeType = url.searchParams.get("route_type");

    if (!isRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const user = await requireUser(req);

    const conn = await db.getConnection();
    let conv: any = null;
    try {
      const [rows]: any = await conn.query(
        `SELECT *
         FROM linescout_conversations
         WHERE user_id = ? AND route_type = ?
         LIMIT 1`,
        [user.id, routeType]
      );

      conv = rows?.[0] || null;

      if (!conv) {
        const [ins]: any = await conn.query(
          `INSERT INTO linescout_conversations
            (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status, project_status)
           VALUES
            (?, ?, 'ai_only', 0, 0, 'unpaid', 'active')`,
          [user.id, routeType]
        );

        const id = Number(ins?.insertId || 0);
        if (!id) {
          return NextResponse.json(
            { ok: false, error: "Conversation could not be created" },
            { status: 500 }
          );
        }

        const [created]: any = await conn.query(
          `SELECT * FROM linescout_conversations WHERE id = ? LIMIT 1`,
          [id]
        );
        conv = created?.[0] || null;
      }
    } finally {
      conn.release();
    }

    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }
    const conversation_status = conv?.project_status ?? null;

    let commitmentDueNgn = 0;
    const settingsConn = await db.getConnection();
    try {
      const [rows]: any = await settingsConn.query(
        "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
      );
      const ngn = Number(rows?.[0]?.commitment_due_ngn || 0);
      if (Number.isFinite(ngn) && ngn > 0) commitmentDueNgn = ngn;
    } finally {
      settingsConn.release();
    }

    return NextResponse.json(
      {
        ok: true,
        route_type: routeType,
        conversation_id: typeof conv?.id === "number" ? conv.id : null,
        chat_mode: conv?.chat_mode ?? null,
        payment_status: conv?.payment_status ?? null,
        conversation_status,
        handoff_id: conv?.handoff_id ?? null,
        has_active_project: Boolean(conv?.handoff_id && conversation_status === "active"),
        is_cancelled: conversation_status === "cancelled",
        commitment_due_ngn: commitmentDueNgn,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const message = String(e?.message || "");
    if (message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
