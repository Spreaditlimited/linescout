// app/api/conversations/me/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

type RouteType = "machine_sourcing" | "white_label";

function unwrapRows<T = any>(q: any): T[] {
  // Handles both shapes:
  // 1) mysql2: [rows, fields]
  // 2) custom wrapper: rows
  if (Array.isArray(q) && Array.isArray(q[0])) return q[0] as T[];
  if (Array.isArray(q)) return q as T[];
  return [];
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const { searchParams } = new URL(req.url);
    const routeType = (searchParams.get("route_type") || "machine_sourcing") as RouteType;

    if (routeType !== "machine_sourcing" && routeType !== "white_label") {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    // 1) Fetch existing
    const q1 = await db.query(
      `SELECT *
       FROM linescout_conversations
       WHERE user_id = ? AND route_type = ?
       LIMIT 1`,
      [user.id, routeType]
    );

    const existingRows = unwrapRows<any>(q1);
    if (existingRows.length) {
      return NextResponse.json({ ok: true, conversation: existingRows[0] });
    }

    // 2) Create if missing
    const q2: any = await db.query(
      `INSERT INTO linescout_conversations
        (user_id, route_type, chat_mode, human_message_limit, human_message_used, payment_status)
       VALUES (?, ?, 'ai_only', 0, 0, 'unpaid')`,
      [user.id, routeType]
    );

    // Try to get insertId (mysql2 returns [result, fields])
    const insertResult = Array.isArray(q2) ? q2[0] : q2;
    const insertId = insertResult?.insertId;

    // 3) Return created row
    if (insertId) {
      const q3 = await db.query(
        `SELECT * FROM linescout_conversations WHERE id = ? LIMIT 1`,
        [insertId]
      );
      const createdById = unwrapRows<any>(q3);
      return NextResponse.json({ ok: true, conversation: createdById[0] || null });
    }

    // Fallback: re-select by user + route_type
    const q4 = await db.query(
      `SELECT *
       FROM linescout_conversations
       WHERE user_id = ? AND route_type = ?
       LIMIT 1`,
      [user.id, routeType]
    );

    const createdRows = unwrapRows<any>(q4);
    if (createdRows.length) {
      return NextResponse.json({ ok: true, conversation: createdRows[0] });
    }

    return NextResponse.json(
      { ok: false, error: "Conversation could not be created" },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unauthorized" }, { status: 401 });
  }
}