import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);

    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => Number(x)).filter((n: number) => n > 0)
      : [];
    const all = !!body?.all;

    if (!all && !ids.length) {
      return NextResponse.json({ ok: false, error: "ids or all is required" }, { status: 400 });
    }

    if (all) {
      await queryRows(
        `UPDATE linescout_notifications
         SET is_read = 1, read_at = NOW()
         WHERE target = 'user' AND user_id = ? AND is_read = 0`,
        [user.id]
      );
    } else {
      await queryRows(
        `UPDATE linescout_notifications
         SET is_read = 1, read_at = NOW()
         WHERE target = 'user' AND user_id = ? AND id IN (?)`,
        [user.id, ids]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
