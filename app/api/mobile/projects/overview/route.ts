import { NextResponse } from "next/server";
import { requireAccountUser } from "@/lib/auth";
import { getProjectOverview } from "@/lib/project-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAccountUser(req);
    const overview = await getProjectOverview(user);
    return NextResponse.json({ ok: true, ...overview });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Server error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
