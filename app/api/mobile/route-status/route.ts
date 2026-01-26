import { NextRequest, NextResponse } from "next/server";

type RouteType = "machine_sourcing" | "white_label";

function isRouteType(x: string | null): x is RouteType {
  return x === "machine_sourcing" || x === "white_label";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const routeType = url.searchParams.get("route_type");

    if (!isRouteType(routeType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid route_type" },
        { status: 400 }
      );
    }

    // Forward auth exactly as-is (mobile uses Bearer token)
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    // Call the existing endpoint (no DB assumptions, no new schema)
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      "http://localhost:3000";

    const res = await fetch(
      `${origin}/api/conversations/me?route_type=${routeType}`,
      {
        method: "GET",
        headers: {
          authorization: auth,
          "content-type": "application/json",
        },
        // Avoid caching issues in dev
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || "Failed to load conversation" },
        { status: res.status || 500 }
      );
    }

    const conv = data?.conversation || null;

    // Minimal routing contract (no tokens exposed in UI)
    // NOTE: conversation_status maps to DB field: conversations.project_status
    const conversation_status = conv?.project_status ?? null;

    const payload = {
      ok: true,
      route_type: routeType,
      conversation_id: typeof conv?.id === "number" ? conv.id : null,
      chat_mode: conv?.chat_mode ?? null,
      payment_status: conv?.payment_status ?? null,

      // Renamed for clarity in mobile
      conversation_status,

      handoff_id: conv?.handoff_id ?? null,

      // Derived flags
      has_active_project: Boolean(
        conv?.handoff_id && conversation_status === "active"
      ),
      is_cancelled: conversation_status === "cancelled",
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}