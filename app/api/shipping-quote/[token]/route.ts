import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const safeToken = String(token || "").trim();
  if (!safeToken) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureShippingQuoteTables(conn);
    const [rows]: any = await conn.query(
      `SELECT q.*
       FROM linescout_shipping_quotes q
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
