import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAccountUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        `
        SELECT
          m.account_id,
          m.role,
          a.name,
          CASE WHEN c.active_account_id = m.account_id THEN 1 ELSE 0 END AS is_active
        FROM linescout_account_members m
        JOIN linescout_accounts a ON a.id = m.account_id
        LEFT JOIN linescout_account_user_contexts c ON c.user_id = m.user_id
        WHERE m.user_id = ?
          AND m.status = 'active'
        ORDER BY is_active DESC, (m.role = 'owner') DESC, m.id ASC
        `,
        [Number(user.id)]
      );

      return NextResponse.json({
        ok: true,
        active_account_id: Number(user.account_id),
        accounts: (rows || []).map((r: any) => ({
          account_id: Number(r.account_id || 0),
          role: String(r.role || "member"),
          name: r.name ? String(r.name) : null,
          is_active: Number(r.is_active || 0) === 1,
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

