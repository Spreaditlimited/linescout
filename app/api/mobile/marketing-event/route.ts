import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureMarketingTables, recordMarketingEvent } from "@/lib/marketing-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.event_type || "").trim();
    const relatedId = String(body?.related_id || "").trim();
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : null;

    if (!eventType) {
      return NextResponse.json({ ok: false, error: "Missing event_type" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      await ensureMarketingTables(conn);
      await recordMarketingEvent(conn, {
        userId: user.id,
        eventType: eventType as any,
        relatedId: relatedId || null,
        meta,
        dedupeMinutes: 120,
      });
      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
