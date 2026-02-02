import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCursor(raw: string | null) {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const url = new URL(req.url);
    const cursor = parseCursor(url.searchParams.get("cursor"));
    const limitRaw = Number(url.searchParams.get("limit") || 30);
    const limit = Math.max(5, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30));

    const params: any[] = [user.id];
    let where = `target = 'user' AND user_id = ?`;
    if (cursor) {
      where += " AND id < ?";
      params.push(cursor);
    }

    const rows: any = await queryRows(
      `SELECT id, title, body, data_json, is_read, created_at
       FROM linescout_notifications
       WHERE ${where}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit]
    );

    const items = (rows || []).map((r: any) => {
      let data = null;
      try {
        data = r.data_json ? JSON.parse(r.data_json) : null;
      } catch {
        data = null;
      }
      return {
        id: Number(r.id),
        title: r.title,
        body: r.body,
        data,
        is_read: !!r.is_read,
        created_at: r.created_at,
      };
    });

    const nextCursor = items.length ? items[items.length - 1].id : 0;
    return NextResponse.json({ ok: true, items, next_cursor: nextCursor });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
