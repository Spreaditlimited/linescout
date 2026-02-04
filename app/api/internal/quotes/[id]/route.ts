import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
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

async function canAccessQuote(conn: any, user: { id: number; role: string }, quoteId: number) {
  if (user.role === "admin") return true;
  const [rows]: any = await conn.query(
    `SELECT q.id
     FROM linescout_quotes q
     JOIN linescout_conversations c ON c.handoff_id = q.handoff_id
     WHERE q.id = ?
       AND c.assigned_agent_id = ?
     LIMIT 1`,
    [quoteId, user.id]
  );
  if (rows?.length) return true;

  const [createdRows]: any = await conn.query(
    `SELECT id
     FROM linescout_quotes
     WHERE id = ?
       AND created_by = ?
     LIMIT 1`,
    [quoteId, user.id]
  );
  return !!createdRows?.length;
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function computeTotals(items: any[], exchangeRmb: number, exchangeUsd: number, shippingRateUsd: number, shippingUnit: string, markupPercent: number) {
  let totalProductRmb = 0;
  let totalLocalTransportRmb = 0;
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = num(item.quantity, 0);
    const unitPrice = num(item.unit_price_rmb, 0);
    const unitWeight = num(item.unit_weight_kg, 0);
    const unitCbm = num(item.unit_cbm, 0);
    const localTransport = num(item.local_transport_rmb, 0);

    totalProductRmb += qty * unitPrice;
    totalLocalTransportRmb += localTransport;
    totalWeightKg += qty * unitWeight;
    totalCbm += qty * unitCbm;
  }

  const totalProductRmbWithLocal = totalProductRmb + totalLocalTransportRmb;
  const totalProductNgn = totalProductRmbWithLocal * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb: totalProductRmbWithLocal,
    totalProductNgn,
    totalWeightKg,
    totalCbm,
    totalShippingUsd,
    totalShippingNgn,
    totalMarkupNgn,
    totalDueNgn,
  };
}

function ensureItems(raw: any) {
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item) => ({
    product_name: String(item.product_name || "").trim(),
    product_description: String(item.product_description || "").trim(),
    quantity: num(item.quantity, 0),
    unit_price_rmb: num(item.unit_price_rmb, 0),
    unit_weight_kg: num(item.unit_weight_kg, 0),
    unit_cbm: num(item.unit_cbm, 0),
    local_transport_rmb: num(item.local_transport_rmb, 0),
  }));
}

async function hasQuoteNoteColumn(conn: any) {
  const [rows]: any = await conn.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'linescout_quotes'
       AND COLUMN_NAME = 'agent_note'
     LIMIT 1`
  );
  return !!rows?.length;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const quoteId = Number(id);
  if (!quoteId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    const allowed = await canAccessQuote(conn, auth.user, quoteId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const [rows]: any = await conn.query(
      `SELECT q.*
       FROM linescout_quotes q
       WHERE q.id = ?
       LIMIT 1`,
      [quoteId]
    );

    if (!rows?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, item: rows[0] });
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const quoteId = Number(id);
  if (!quoteId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const items = ensureItems(body?.items);
  if (!items.length || items.some((i) => !i.product_name || i.quantity <= 0)) {
    return NextResponse.json({ ok: false, error: "At least one valid item is required" }, { status: 400 });
  }

  const exchange_rate_rmb = num(body?.exchange_rate_rmb, 0);
  const exchange_rate_usd = num(body?.exchange_rate_usd, 0);
  const shipping_rate_usd = num(body?.shipping_rate_usd, 0);
  const shipping_rate_unit = String(body?.shipping_rate_unit || "per_kg");
  const shipping_type_id = body?.shipping_type_id ? Number(body.shipping_type_id) : null;
  const markup_percent = num(body?.markup_percent, 0);
  const agent_percent = num(body?.agent_percent, 0);
  const agent_commitment_percent = num(body?.agent_commitment_percent, 0);
  const commitment_due_ngn = num(body?.commitment_due_ngn, 0);
  const deposit_enabled = body?.deposit_enabled === true || body?.deposit_enabled === 1;
  const deposit_percent_raw = num(body?.deposit_percent, 0);
  const deposit_percent = deposit_enabled ? deposit_percent_raw : 0;
  const payment_purpose = String(body?.payment_purpose || "full_product_payment");
  const currency = String(body?.currency || "NGN");
  const includeAgentNote = Object.prototype.hasOwnProperty.call(body || {}, "agent_note");
  const agent_note = String(body?.agent_note || "").trim();

  if (exchange_rate_rmb <= 0 || exchange_rate_usd <= 0 || shipping_rate_usd <= 0) {
    return NextResponse.json({ ok: false, error: "Exchange rates and shipping rate must be greater than 0" }, { status: 400 });
  }
  if (shipping_rate_unit !== "per_kg" && shipping_rate_unit !== "per_cbm") {
    return NextResponse.json({ ok: false, error: "Invalid shipping_rate_unit" }, { status: 400 });
  }
  if (deposit_enabled && (deposit_percent < 1 || deposit_percent > 100)) {
    return NextResponse.json({ ok: false, error: "Deposit percent must be between 1 and 100" }, { status: 400 });
  }

  const totals = computeTotals(items, exchange_rate_rmb, exchange_rate_usd, shipping_rate_usd, shipping_rate_unit, markup_percent);

  const conn = await db.getConnection();
  try {
    const allowed = await canAccessQuote(conn, auth.user, quoteId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const supportsAgentNote = await hasQuoteNoteColumn(conn);
    const updateAgentNote = supportsAgentNote && includeAgentNote;
    const setNoteSql = updateAgentNote ? "agent_note = ?," : "";
    const params = [
      currency,
      payment_purpose,
      exchange_rate_rmb,
      exchange_rate_usd,
      shipping_type_id,
      shipping_rate_usd,
      shipping_rate_unit,
      markup_percent,
      agent_percent,
      agent_commitment_percent,
      commitment_due_ngn,
      deposit_enabled ? 1 : 0,
      deposit_percent || null,
      ...(updateAgentNote ? [agent_note || null] : []),
      JSON.stringify(items),
      totals.totalProductRmb,
      totals.totalProductNgn,
      totals.totalWeightKg,
      totals.totalCbm,
      totals.totalShippingUsd,
      totals.totalShippingNgn,
      totals.totalMarkupNgn,
      totals.totalDueNgn,
      auth.user.id,
      quoteId,
    ];

    await conn.query(
      `UPDATE linescout_quotes
       SET currency = ?,
           payment_purpose = ?,
           exchange_rate_rmb = ?,
           exchange_rate_usd = ?,
           shipping_type_id = ?,
           shipping_rate_usd = ?,
           shipping_rate_unit = ?,
           markup_percent = ?,
           agent_percent = ?,
           agent_commitment_percent = ?,
           commitment_due_ngn = ?,
           deposit_enabled = ?,
           deposit_percent = ?,
           ${setNoteSql}
           items_json = ?,
           total_product_rmb = ?,
           total_product_ngn = ?,
           total_weight_kg = ?,
           total_cbm = ?,
           total_shipping_usd = ?,
           total_shipping_ngn = ?,
           total_markup_ngn = ?,
           total_due_ngn = ?,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      params
    );

    const [handoffRows]: any = await conn.query(
      `SELECT handoff_id
       FROM linescout_quotes
       WHERE id = ?
       LIMIT 1`,
      [quoteId]
    );
    const handoffId = Number(handoffRows?.[0]?.handoff_id || 0);

    if (handoffId) {
      // Keep handoff financials in sync with latest estimated landing cost
      await conn.query(
        `INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
         VALUES (?, 'NGN', ?)
         ON DUPLICATE KEY UPDATE total_due = VALUES(total_due), currency = VALUES(currency)`,
        [handoffId, totals.totalDueNgn]
      );
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
