import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label";
}

function nonEmpty(s: any) {
  return typeof s === "string" && s.trim().length > 0;
}

function rand(len: number) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

// Prices in kobo
function amountForPurpose(purpose: string) {
  // Keep it explicit and boring. You can move to env later.
  if (purpose === "sourcing") return 100000; // ₦100,000
  if (purpose === "business_plan") return 2000000; // ₦20,000 (example)
  return 10000000;
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!paystackSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing PAYSTACK_SECRET_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const purpose = String(body?.purpose || "sourcing").trim();
    const routeType = body?.route_type;

    if (!isValidRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const sourceConversationIdRaw = Number(body?.source_conversation_id || 0);
    const sourceConversationId =
      Number.isFinite(sourceConversationIdRaw) && sourceConversationIdRaw > 0
        ? sourceConversationIdRaw
        : null;

    const email =
      (u as any)?.email && nonEmpty((u as any).email) ? String((u as any).email).trim() : "";

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "User email is required for Paystack initialize" },
        { status: 400 }
      );
    }

    const amount = amountForPurpose(purpose);

    // Unique, traceable reference
    const userId = Number((u as any).id || 0);
    const reference = `LS_${userId}_${Date.now()}_${rand(6)}`;

    const initPayload = {
      email,
      amount,
      reference,
      // IMPORTANT: This metadata is how we carry AI context into paid project later.
      metadata: {
        app: "linescout_mobile",
        purpose,
        route_type: routeType,
        user_id: userId,
        source_conversation_id: sourceConversationId,
      },
    };

    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initPayload),
    });

    const j: any = await r.json().catch(() => null);

    if (!r.ok || !j?.status || !j?.data?.authorization_url) {
      const msg =
        j?.message ||
        j?.data?.message ||
        `Paystack initialize failed (HTTP ${r.status})`;
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      authorization_url: j.data.authorization_url,
      reference,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}