import { NextResponse } from "next/server";
import { drainCentralAffiliateOutbox, reconcileLineScoutPaymentEvents } from "@/lib/central-affiliate-events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const reconciled = await reconcileLineScoutPaymentEvents(500);
    const delivery = await drainCentralAffiliateOutbox(100);
    return NextResponse.json({ ok: true, ...reconciled, ...delivery });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Outbox delivery failed." }, { status: 500 });
  }
}
