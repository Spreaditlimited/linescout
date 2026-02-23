import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listTopWhiteLabelProducts, refreshKeepaProducts } from "@/lib/keepa-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronRequest(req: Request) {
  const vercelCron = String(req.headers.get("x-vercel-cron") || "").trim();
  if (vercelCron === "1") return true;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const headerSecret = String(req.headers.get("x-cron-secret") || "").trim();
  return headerSecret && headerSecret === secret;
}

export async function GET(req: Request) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const maxProductsEnv = Number(process.env.KEEPA_MAX_PRODUCTS_PER_RUN || "200");
  const maxProducts = Number.isFinite(maxProductsEnv) ? Math.max(1, maxProductsEnv) : 200;

  const conn = await db.getConnection();
  try {
    const rows = await listTopWhiteLabelProducts(conn, 200, 0);
    const result = await refreshKeepaProducts(conn, rows, {
      maxProducts,
      marketplaces: ["UK", "CA"],
    });
    return NextResponse.json({ ok: true, scope: "daily", ...result });
  } catch (e: any) {
    console.error("GET /api/internal/cron/keepa-daily error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Keepa daily refresh failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
