import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const email = normalizeEmail(user.email);
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT
          i.id,
          i.account_id,
          i.role,
          i.expires_at,
          i.created_at,
          a.name AS account_name,
          owner.email AS owner_email,
          inviter.email AS invited_by_email
        FROM linescout_account_invites i
        JOIN linescout_accounts a ON a.id = i.account_id
        LEFT JOIN users owner ON owner.id = a.owner_user_id
        LEFT JOIN users inviter ON inviter.id = i.invited_by_user_id
        WHERE i.email_normalized = ?
          AND i.accepted_at IS NULL
          AND i.revoked_at IS NULL
          AND i.expires_at > NOW()
        ORDER BY i.id DESC
        `,
        [email]
      );

      return NextResponse.json({
        ok: true,
        items: (rows || []).map((r: any) => ({
          id: Number(r.id || 0),
          account_id: Number(r.account_id || 0),
          role: String(r.role || "member"),
          account_name: r.account_name ? String(r.account_name) : null,
          owner_email: r.owner_email ? String(r.owner_email) : null,
          invited_by_email: r.invited_by_email ? String(r.invited_by_email) : null,
          expires_at: r.expires_at || null,
          created_at: r.created_at || null,
        })),
      });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    const msg = e?.message || "Unauthorized";
    const code = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

