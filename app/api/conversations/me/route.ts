// app/api/conversations/me/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";
type EntryMode = "ai_only" | "limited_human" | "paid_human";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normRouteType(v: string | null): RouteType {
  if (v === "white_label") return "white_label";
  if (v === "simple_sourcing") return "simple_sourcing";
  return "machine_sourcing";
}

function computeEntryMode(row: any): {
  entry_mode: EntryMode;
  requires_payment: boolean;
  is_cancelled: boolean;
  can_use_human: boolean;
} {
  const chatMode = String(row?.chat_mode || "ai_only") as EntryMode;
  const paymentStatus = String(row?.payment_status || "unpaid");
  const projectStatus = String(row?.project_status || "active");
  const isCancelled = projectStatus === "cancelled";

  // paid mode is only "fully active" if payment is paid and project not cancelled
  const paidActive = chatMode === "paid_human" && paymentStatus === "paid" && !isCancelled;

  // limited mode depends on remaining human quota (if you use it)
  const limit = Number(row?.human_message_limit || 0);
  const used = Number(row?.human_message_used || 0);
  const limitedActive = chatMode === "limited_human" && !isCancelled && limit > used;

  const aiActive = !isCancelled && chatMode === "ai_only";

  const entry_mode: EntryMode = paidActive
    ? "paid_human"
    : limitedActive
    ? "limited_human"
    : "ai_only";

  // payment required only when trying to be in paid_human but not yet paid
  const requires_payment = chatMode === "paid_human" && paymentStatus !== "paid" && !isCancelled;

  // can use human if limited is active or paid is active
  const can_use_human = entry_mode === "limited_human" || entry_mode === "paid_human";

  return { entry_mode, requires_payment, is_cancelled: isCancelled, can_use_human };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const { searchParams } = new URL(req.url);
    const routeType = normRouteType(searchParams.get("route_type"));

    const conn = await db.getConnection();
    try {
      // 1) Get existing
      const [rows]: any = await conn.query(
        `SELECT *
         FROM linescout_conversations
         WHERE user_id = ? AND route_type = ?
         LIMIT 1`,
        [user.id, routeType]
      );

      let conversation = rows?.[0] || null;

      // 2) Create if missing (AI-only default)
      if (!conversation) {
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
        conversation = created?.[0] || null;
      }

      if (!conversation) {
        return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
      }

      // 3) Bootstrap metadata (does not break existing callers)
      const meta = computeEntryMode(conversation);

      return NextResponse.json({
        ok: true,
        conversation,
        // extra fields for “bootstrap” (safe to ignore by old callers)
        entry_mode: meta.entry_mode,
        requires_payment: meta.requires_payment,
        is_cancelled: meta.is_cancelled,
        can_use_human: meta.can_use_human,
        handoff_id: conversation.handoff_id ?? null,
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unauthorized" }, { status: 401 });
  }
}
