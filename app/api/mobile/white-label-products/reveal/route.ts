import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { revealWhiteLabelAmazonPrice } from "@/lib/white-label-reveal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid product_id" }, { status: 400 });
    }

    const conn = await db.getConnection();
    try {
      const result = await revealWhiteLabelAmazonPrice(conn, auth.id, productId);
      if (!result.ok) {
        const code = result.code === "subscription_required" ? 402 : result.code === "limit_reached" ? 429 : 400;
        return NextResponse.json(result, { status: code });
      }
      return NextResponse.json(result);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
