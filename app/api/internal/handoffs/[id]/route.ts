// app/api/internal/handoffs/[id]/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
  }

  const h = await headers();

  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.is_active,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    const canView = role === "admin" ? true : !!rows[0].can_view_handoffs;

    if (!canView) return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return {
      ok: true as const,
      user: {
        id: Number(rows[0].id),
        username: String(rows[0].username || ""),
        role: role as "admin" | "agent",
      },
    };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/handoffs/:id
 * Admin (and handoffs-permitted agents) only.
 * Returns handoff details + useful joined labels.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const handoffId = num(id, 0);
  if (!handoffId) {
    return NextResponse.json({ ok: false, error: "Invalid handoff id" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT
        h.*,
        b.name AS bank_name,
        sc.name AS shipping_company_name
      FROM linescout_handoffs h
      LEFT JOIN linescout_banks b ON b.id = h.bank_id
      LEFT JOIN linescout_shipping_companies sc ON sc.id = h.shipping_company_id
      WHERE h.id = ?
      LIMIT 1
      `,
      [handoffId]
    );

    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Handoff not found" }, { status: 404 });
    }

    const item = rows[0];

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(item.id),
        token: String(item.token || ""),
        handoff_type: String(item.handoff_type || ""),
        status: String(item.status || ""),

        customer_name: item.customer_name ?? null,
        email: item.email ?? null,
        whatsapp_number: item.whatsapp_number ?? null,
        context: item.context ?? null,

        claimed_by: item.claimed_by ?? null,
        claimed_at: item.claimed_at ?? null,

        created_at: item.created_at ?? null,
        paid_at: item.paid_at ?? null,
        manufacturer_found_at: item.manufacturer_found_at ?? null,
        shipped_at: item.shipped_at ?? null,
        delivered_at: item.delivered_at ?? null,
        cancelled_at: item.cancelled_at ?? null,
        cancel_reason: item.cancel_reason ?? null,
        resolved_at: item.resolved_at ?? null,

        bank_id: item.bank_id ?? null,
        bank_name: item.bank_name ?? null,

        shipping_company_id: item.shipping_company_id ?? null,
        shipping_company_name: item.shipping_company_name ?? null,
        shipper: item.shipper ?? null,
        tracking_number: item.tracking_number ?? null,

        conversation_id: item.conversation_id ?? null,
      },
    });
  } catch (e: any) {
    console.error("GET /api/internal/handoffs/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load handoff" }, { status: 500 });
  } finally {
    conn.release();
  }
}