import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    if (String(user.account_role || "") !== "owner") {
      return NextResponse.json({ ok: false, error: "Only account owner can remove members." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const memberUserId = toInt(body?.member_user_id);
    if (!memberUserId) {
      return NextResponse.json({ ok: false, error: "member_user_id is required" }, { status: 400 });
    }
    if (memberUserId === Number(user.id)) {
      return NextResponse.json({ ok: false, error: "Owner cannot remove self." }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [res]: any = await conn.query(
        `
        UPDATE linescout_account_members
        SET status = 'removed',
            removed_at = NOW(),
            updated_at = NOW()
        WHERE account_id = ?
          AND user_id = ?
          AND status = 'active'
          AND role <> 'owner'
        LIMIT 1
        `,
        [Number(user.account_id), memberUserId]
      );

      if (!res?.affectedRows) {
        return NextResponse.json({ ok: false, error: "Member not found or cannot be removed." }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

