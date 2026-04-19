import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";
import { setActiveAccountForUser } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const inviteIdRaw = Number(body?.invite_id || 0);
    const inviteId = Number.isFinite(inviteIdRaw) && inviteIdRaw > 0 ? Math.floor(inviteIdRaw) : 0;
    if (!token && !inviteId) {
      return NextResponse.json({ ok: false, error: "token or invite_id is required" }, { status: 400 });
    }

    const userEmail = normalizeEmail(user.email);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      let inviteRows: any = [];
      if (token) {
        const tokenHash = sha256(token);
        const [rowsByToken]: any = await conn.query(
          `
          SELECT id, account_id, email_normalized, role, accepted_at, revoked_at, expires_at
          FROM linescout_account_invites
          WHERE token_hash = ?
          LIMIT 1
          `,
          [tokenHash]
        );
        inviteRows = rowsByToken || [];
      } else {
        const [rowsById]: any = await conn.query(
          `
          SELECT id, account_id, email_normalized, role, accepted_at, revoked_at, expires_at
          FROM linescout_account_invites
          WHERE id = ?
          LIMIT 1
          `,
          [inviteId]
        );
        inviteRows = rowsById || [];
      }
      const invite = inviteRows?.[0];
      if (!invite) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
      }
      if (invite.accepted_at) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Invite already accepted." }, { status: 409 });
      }
      if (invite.revoked_at) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Invite was revoked." }, { status: 409 });
      }
      if (!invite.expires_at || new Date(invite.expires_at).getTime() < Date.now()) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 409 });
      }

      if (normalizeEmail(String(invite.email_normalized || "")) !== userEmail) {
        await conn.rollback();
        return NextResponse.json({ ok: false, error: "Invite email does not match this signed-in account." }, { status: 403 });
      }

      await conn.query(
        `
        INSERT INTO linescout_account_members
          (account_id, user_id, role, status, invited_by_user_id, joined_at, created_at, updated_at)
        VALUES
          (?, ?, ?, 'active', ?, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          role = CASE WHEN role = 'owner' THEN 'owner' ELSE VALUES(role) END,
          status = 'active',
          removed_at = NULL,
          joined_at = COALESCE(joined_at, VALUES(joined_at)),
          updated_at = NOW()
        `,
        [Number(invite.account_id), Number(user.id), "member", Number(user.id)]
      );

      await conn.query(
        `
        UPDATE linescout_account_invites
        SET accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = ?
        LIMIT 1
        `,
        [Number(invite.id)]
      );

      await conn.commit();
      await setActiveAccountForUser(Number(user.id), Number(invite.account_id));
      return NextResponse.json({ ok: true, account_id: Number(invite.account_id) });
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
