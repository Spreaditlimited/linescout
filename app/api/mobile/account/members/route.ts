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
          m.id,
          m.user_id,
          m.role,
          m.status,
          m.joined_at,
          m.created_at,
          u.email,
          u.display_name
        FROM linescout_account_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.account_id = ?
          AND m.status = 'active'
        ORDER BY (m.role = 'owner') DESC, m.id ASC
        `,
        [Number(user.account_id)]
      );

      return NextResponse.json({
        ok: true,
        account: {
          id: Number(user.account_id),
          role: String(user.account_role || "member"),
        },
        members: (rows || []).map((r: any) => ({
          id: Number(r.id || 0),
          user_id: Number(r.user_id || 0),
          role: String(r.role || "member"),
          status: String(r.status || "active"),
          email: String(r.email || ""),
          display_name: r.display_name ? String(r.display_name) : null,
          joined_at: r.joined_at || null,
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

