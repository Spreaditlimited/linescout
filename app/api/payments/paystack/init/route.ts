import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

function nonEmpty(s: any) {
  return typeof s === "string" && s.trim().length > 0;
}

function rand(len: number) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

function safeCallbackUrl(req: Request, raw: any) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && url.origin === origin) return url.toString();
    if (host && url.host === host) return url.toString();
    return null;
  } catch {
    return null;
  }
}

// Prices in kobo (sourcing uses admin settings)
async function amountForPurpose(purpose: string) {
  if (purpose === "business_plan") return 2000000; // ₦20,000 (example)
  if (purpose !== "sourcing" && purpose !== "reorder") return 10000000;

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
    );
    const ngn = Number(rows?.[0]?.commitment_due_ngn || 0);
    const safeNgn = Number.isFinite(ngn) && ngn > 0 ? ngn : 100000;
    return Math.round(safeNgn * 100);
  } finally {
    conn.release();
  }
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
    let routeType = body?.route_type;
    const callbackUrl = safeCallbackUrl(req, body?.callback_url);
    const productId = String(body?.product_id || "").trim();
    const productName = String(body?.product_name || "").trim();
    const productCategory = String(body?.product_category || "").trim();
    const productLandedPerUnit = String(body?.product_landed_ngn_per_unit || "").trim();
    const simpleProductName = String(body?.simple_product_name || "").trim();
    const simpleQuantity = String(body?.simple_quantity || "").trim();
    const simpleDestination = String(body?.simple_destination || "").trim();
    const simpleNotes = String(body?.simple_notes || "").trim();
    const reorderOfConversationIdRaw = Number(body?.reorder_of_conversation_id || 0);
    const reorderUserNote = String(body?.reorder_user_note || "").trim();

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

    const amount = await amountForPurpose(purpose);

    // Unique, traceable reference
    const userId = Number((u as any).id || 0);
    const reference = `LS_${userId}_${Date.now()}_${rand(6)}`;

    let reorderOfConversationId: number | null = null;
    let reorderOfHandoffId: number | null = null;
    let reorderOriginalAgentId: number | null = null;
    let resolvedRouteType: RouteType | null = null;

    if (purpose === "reorder") {
      const n = Number.isFinite(reorderOfConversationIdRaw) && reorderOfConversationIdRaw > 0 ? reorderOfConversationIdRaw : 0;
      if (!n) {
        return NextResponse.json(
          { ok: false, error: "reorder_of_conversation_id is required" },
          { status: 400 }
        );
      }

      const conn = await db.getConnection();
      try {
        const [rows]: any = await conn.query(
          `
          SELECT c.id, c.user_id, c.route_type, c.assigned_agent_id, c.handoff_id, h.status AS handoff_status, h.delivered_at
          FROM linescout_conversations c
          LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
          WHERE c.id = ? AND c.user_id = ?
          LIMIT 1
          `,
          [n, userId]
        );
        const r = rows?.[0];
        if (!r?.id || !r?.handoff_id) {
          return NextResponse.json({ ok: false, error: "Original project not found." }, { status: 404 });
        }
        const status = String(r.handoff_status || "").trim().toLowerCase();
        const isDelivered = status === "delivered" || !!r.delivered_at;
        if (!isDelivered) {
          return NextResponse.json(
            { ok: false, error: "Re-order is only available for delivered projects." },
            { status: 400 }
          );
        }
        reorderOfConversationId = Number(r.id);
        reorderOfHandoffId = Number(r.handoff_id);
        reorderOriginalAgentId = Number(r.assigned_agent_id || 0) || null;
        resolvedRouteType = isValidRouteType(r.route_type) ? (r.route_type as RouteType) : "machine_sourcing";
      } finally {
        conn.release();
      }
    }

    if (purpose !== "reorder") {
      if (!isValidRouteType(routeType)) {
        return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
      }
    } else {
      routeType = resolvedRouteType || "machine_sourcing";
    }

    const initPayload = {
      email,
      amount,
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      // IMPORTANT: This metadata is how we carry AI context into paid project later.
      metadata: {
        app: "linescout_mobile",
        purpose,
        route_type: routeType,
        user_id: userId,
        source_conversation_id: sourceConversationId,
        reorder_of_conversation_id: reorderOfConversationId,
        reorder_of_handoff_id: reorderOfHandoffId,
        reorder_original_agent_id: reorderOriginalAgentId,
        reorder_user_note: reorderUserNote || null,
        simple_sourcing_brief:
          simpleProductName || simpleQuantity || simpleDestination || simpleNotes
            ? {
                product_name: simpleProductName || null,
                quantity: simpleQuantity || null,
                destination: simpleDestination || null,
                notes: simpleNotes || null,
              }
            : null,
        product: productId || productName || productCategory
          ? {
              id: productId || null,
              name: productName || null,
              category: productCategory || null,
              landed_ngn_per_unit: productLandedPerUnit || null,
            }
          : null,
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
