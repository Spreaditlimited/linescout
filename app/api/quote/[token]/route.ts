import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         q.*,
         COALESCE(
           NULLIF(TRIM(h.customer_name), ''),
           NULLIF(
             TRIM((
               SELECT l.name
               FROM linescout_conversations c2
               JOIN users u2 ON u2.id = c2.user_id
               LEFT JOIN linescout_leads l ON l.email = u2.email
               WHERE c2.handoff_id = h.id
               ORDER BY l.created_at DESC, l.id DESC
               LIMIT 1
             )),
             ''
           ),
           NULLIF(
             TRIM((
               SELECT u2.display_name
               FROM linescout_conversations c2
               JOIN users u2 ON u2.id = c2.user_id
               WHERE c2.handoff_id = h.id
               ORDER BY c2.id DESC
               LIMIT 1
             )),
             ''
           ),
           'Customer'
         ) AS customer_name
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.token = ?
       LIMIT 1`,
      [safeToken]
    );

    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, item: rows[0] });
  } finally {
    conn.release();
  }
}
