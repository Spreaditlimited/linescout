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
      return NextResponse.json({ ok: false, error: "Only account owner can revoke invites." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const inviteId = toInt(body?.invite_id);
    if (!inviteId) {
      return NextResponse.json({ ok: false, error: "invite_id is required" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const [res]: any = await conn.query(
        `
        UPDATE linescout_account_invites
        SET revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
          AND account_id = ?
          AND accepted_at IS NULL
          AND revoked_at IS NULL
        LIMIT 1
        `,
        [inviteId, Number(user.account_id)]
      );

      if (!res?.affectedRows) {
        return NextResponse.json({ ok: false, error: "Invite not found or cannot be revoked." }, { status: 404 });
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

