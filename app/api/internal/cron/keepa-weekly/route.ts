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

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") || "");
  const offsetParam = Number(url.searchParams.get("offset") || "");
  const maxProductsEnv = Number(process.env.KEEPA_MAX_PRODUCTS_PER_RUN || "500");
  const maxProducts = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(limitParam, 500))
    : Number.isFinite(maxProductsEnv)
    ? Math.max(1, maxProductsEnv)
    : 500;
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 200;

  const conn = await db.getConnection();
  try {
    const rows = await listTopWhiteLabelProducts(conn, 500, offset);
    const result = await refreshKeepaProducts(conn, rows, {
      maxProducts,
      marketplaces: ["UK", "CA"],
      allowSearch: true,
    });
    return NextResponse.json({ ok: true, scope: "weekly", ...result });
  } catch (e: any) {
    console.error("GET /api/internal/cron/keepa-weekly error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Keepa weekly refresh failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
