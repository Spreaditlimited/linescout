import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import {
  getProjectOverview,
  ProjectOverviewError,
} from "@/lib/project-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const url = new URL(req.url);
    const handoffId = Number(url.searchParams.get("handoff_id") || 0);
    const conversationId = Number(
      url.searchParams.get("conversation_id") || 0,
    );

    if (!handoffId && !conversationId) {
      return NextResponse.json(
        { ok: false, error: "handoff_id or conversation_id is required" },
        { status: 400 },
      );
    }

    const overview = await getProjectOverview(user, {
      handoffId: handoffId || undefined,
      conversationId: conversationId || undefined,
    });
    return NextResponse.json(overview.summaries[0]);
  } catch (error: unknown) {
    if (error instanceof ProjectOverviewError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "Server error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
