import { NextRequest, NextResponse } from "next/server";
import { getUserTokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isRouteType(x: string | null): x is RouteType {
  return x === "machine_sourcing" || x === "white_label" || x === "simple_sourcing";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const routeType = url.searchParams.get("route_type");

    if (!isRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const token = getUserTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Always correct in prod + preview + local
    const origin = req.nextUrl.origin;

    const res = await fetch(`${origin}/api/conversations/me?route_type=${routeType}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || "Failed to load conversation" },
        { status: res.status || 500 }
      );
    }

    const conv = data?.conversation || null;
    const conversation_status = conv?.project_status ?? null;

    let commitmentDueNgn = 100000;
    const conn = await db.getConnection();
    try {
      const [rows]: any = await conn.query(
        "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
      );
      const ngn = Number(rows?.[0]?.commitment_due_ngn || 0);
      if (Number.isFinite(ngn) && ngn > 0) commitmentDueNgn = ngn;
    } finally {
      conn.release();
    }

    return NextResponse.json(
      {
        ok: true,
        route_type: routeType,
        conversation_id: typeof conv?.id === "number" ? conv.id : null,
        chat_mode: conv?.chat_mode ?? null,
        payment_status: conv?.payment_status ?? null,
        conversation_status,
        handoff_id: conv?.handoff_id ?? null,
        has_active_project: Boolean(conv?.handoff_id && conversation_status === "active"),
        is_cancelled: conversation_status === "cancelled",
        commitment_due_ngn: commitmentDueNgn,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
