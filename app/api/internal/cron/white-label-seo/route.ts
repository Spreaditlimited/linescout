import { NextResponse } from "next/server";
import { scheduleNextWhiteLabelSeoBatch } from "@/lib/white-label-seo-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await scheduleNextWhiteLabelSeoBatch({ targetSize: 5 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    console.error("White-label SEO scheduling failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Scheduling failed." },
      { status: 500 },
    );
  }
}
