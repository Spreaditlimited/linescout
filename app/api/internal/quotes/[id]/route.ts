import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getFxRate } from "@/lib/fx";
import {
  ensureCountryConfig,
  ensureQuoteCountryColumns,
  ensureHandoffCountryColumns,
  backfillQuoteDefaults,
  backfillHandoffDefaults,
} from "@/lib/country-config";
import { ensureQuoteAddonTables, normalizeRouteType } from "@/lib/quote-addons";
import { ensureQuoteShippingControlColumns } from "@/lib/quote-shipping-controls";
import { sendNoticeEmail } from "@/lib/notice-email";

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

function parseServiceChargeBands(raw: any) {
  if (!raw) return null;
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

function resolveBandPercent(bands: any, routeType: string, amount: number, fallback: number) {
  if (!bands || typeof bands !== "object") return fallback;
  const config = bands[normalizeRouteType(routeType || "")] || bands[routeType] || null;
  if (!config || !Array.isArray(config.bands)) return fallback;
  const cleaned = config.bands
    .map((band: any) => ({
      min: num(band?.min, 0),
      max: band?.max === "" || band?.max == null ? null : num(band?.max, 0),
      percent: num(band?.percent, 0),
    }))
    .filter((band: any) => Number.isFinite(band.min) && Number.isFinite(band.percent));
  for (const band of cleaned) {
    const maxOk = band.max == null || amount <= band.max;
    if (amount >= band.min && maxOk) return Math.max(0, band.percent);
  }
  return fallback;
}

function computeTotals(
  items: any[],
  exchangeRmb: number,
  exchangeUsd: number,
  shippingRateUsd: number,
  shippingUnit: string,
  agentPercent: number,
  lineScoutMarginPercent: number,
  serviceChargePercent: number,
  shippingOverride?: {
    weightKg?: number | null;
    cbm?: number | null;
    rateUsd?: number | null;
    rateUnit?: string | null;
  }
) {
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
  const baseProductNgn = totalProductRmb * exchangeRmb;
  const localTransportNgn = totalLocalTransportRmb * exchangeRmb;
  const effectiveRateUsd =
    Number.isFinite(Number(shippingOverride?.rateUsd)) && Number(shippingOverride?.rateUsd) > 0
      ? Number(shippingOverride?.rateUsd)
      : shippingRateUsd;
  const effectiveUnit =
    String(shippingOverride?.rateUnit || "").toLowerCase() === "per_cbm"
      ? "per_cbm"
      : String(shippingOverride?.rateUnit || "").toLowerCase() === "per_kg"
      ? "per_kg"
      : shippingUnit === "per_cbm"
      ? "per_cbm"
      : "per_kg";
  const effectiveWeightKg =
    Number.isFinite(Number(shippingOverride?.weightKg)) && Number(shippingOverride?.weightKg) > 0
      ? Number(shippingOverride?.weightKg)
      : totalWeightKg;
  const effectiveCbm =
    Number.isFinite(Number(shippingOverride?.cbm)) && Number(shippingOverride?.cbm) > 0
      ? Number(shippingOverride?.cbm)
      : totalCbm;
  const shippingUnits = effectiveUnit === "per_cbm" ? effectiveCbm : effectiveWeightKg;
  const totalShippingUsd = shippingUnits * effectiveRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const safeAgentPercent = Math.max(0, agentPercent);
  const safeLineScoutPercent = Math.max(0, lineScoutMarginPercent);
  const safeServiceChargePercent = Math.max(0, Math.min(serviceChargePercent, safeLineScoutPercent));
  const hiddenUpliftPercent = Math.max(0, safeLineScoutPercent - safeServiceChargePercent);
  const agentUpliftRmb = (totalProductRmb * safeAgentPercent) / 100;
  const agentUpliftNgn = (baseProductNgn * safeAgentPercent) / 100;
  const hiddenUpliftRmb = (totalProductRmb * hiddenUpliftPercent) / 100;
  const hiddenUpliftNgn = (baseProductNgn * hiddenUpliftPercent) / 100;
  const totalProductRmbWithAgent = totalProductRmbWithLocal + agentUpliftRmb + hiddenUpliftRmb;
  const totalProductNgnWithAgent = baseProductNgn + localTransportNgn + agentUpliftNgn + hiddenUpliftNgn;
  const totalMarkupNgn = (baseProductNgn * safeServiceChargePercent) / 100;
  const totalDueNgn = totalProductNgnWithAgent + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb: totalProductRmbWithAgent,
    totalProductNgn: totalProductNgnWithAgent,
    baseProductNgn,
    totalWeightKg,
    totalCbm,
    shippingEffectiveWeightKg: effectiveWeightKg,
    shippingEffectiveCbm: effectiveCbm,
    shippingEffectiveRateUsd: effectiveRateUsd,
    shippingEffectiveRateUnit: effectiveUnit,
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

function firstNameFromFullName(nameRaw: any) {
  const full = String(nameRaw || "").trim();
  if (!full) return "Customer";
  return full.split(/\s+/)[0] || "Customer";
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
    await ensureCountryConfig(conn);
    await ensureQuoteAddonTables(conn);
    await ensureQuoteShippingControlColumns(conn);
    await ensureHandoffCountryColumns(conn);
    await ensureQuoteCountryColumns(conn);
    await backfillHandoffDefaults(conn);
    await backfillQuoteDefaults(conn);

    const allowed = await canAccessQuote(conn, auth.user, quoteId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const [handoffStageRows]: any = await conn.query(
      `SELECT h.status
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.id = ?
       LIMIT 1`,
      [quoteId]
    );
    const stage = String(handoffStageRows?.[0]?.status || "").toLowerCase();
    if (stage && !["manufacturer_found", "paid", "shipped", "delivered"].includes(stage)) {
      return NextResponse.json(
        { ok: false, error: "Quote can only be created after manufacturer is found." },
        { status: 400 }
      );
    }

    const [rows]: any = await conn.query(
      `SELECT q.*, c.name AS country_name, c.iso2 AS country_iso2
       FROM linescout_quotes q
       LEFT JOIN linescout_countries c ON c.id = q.country_id
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
  const shipping_payment_enabled = body?.shipping_payment_enabled === true || body?.shipping_payment_enabled === 1;
  const shipping_actual_weight_kg_raw = num(body?.shipping_actual_weight_kg, 0);
  const shipping_actual_cbm_raw = num(body?.shipping_actual_cbm, 0);
  const shipping_actual_rate_usd_raw = num(body?.shipping_actual_rate_usd, 0);
  const shipping_actual_rate_unit_raw = String(body?.shipping_actual_rate_unit || "").trim().toLowerCase();
  const shipping_actual_rate_unit =
    shipping_actual_rate_unit_raw === "per_cbm"
      ? "per_cbm"
      : shipping_actual_rate_unit_raw === "per_kg"
      ? "per_kg"
      : null;
  const shipping_actual_weight_kg = shipping_actual_weight_kg_raw > 0 ? shipping_actual_weight_kg_raw : null;
  const shipping_actual_cbm = shipping_actual_cbm_raw > 0 ? shipping_actual_cbm_raw : null;
  const shipping_actual_rate_usd = shipping_actual_rate_usd_raw > 0 ? shipping_actual_rate_usd_raw : null;
  const includeAgentNote = Object.prototype.hasOwnProperty.call(body || {}, "agent_note");
  const agent_note = String(body?.agent_note || "").trim();

  if (shipping_rate_usd <= 0) {
    return NextResponse.json({ ok: false, error: "Shipping rate must be greater than 0" }, { status: 400 });
  }
  if (shipping_rate_unit !== "per_kg" && shipping_rate_unit !== "per_cbm") {
    return NextResponse.json({ ok: false, error: "Invalid shipping_rate_unit" }, { status: 400 });
  }
  if (deposit_enabled && (deposit_percent < 1 || deposit_percent > 100)) {
    return NextResponse.json({ ok: false, error: "Deposit percent must be between 1 and 100" }, { status: 400 });
  }
  if (shipping_payment_enabled) {
    if (!shipping_actual_rate_usd || shipping_actual_rate_usd <= 0) {
      return NextResponse.json(
        { ok: false, error: "Provide actual shipping rate (USD) before enabling shipping payment." },
        { status: 400 }
      );
    }
    const unit = shipping_actual_rate_unit || shipping_rate_unit;
    if (unit === "per_cbm" && (!shipping_actual_cbm || shipping_actual_cbm <= 0)) {
      return NextResponse.json(
        { ok: false, error: "Provide actual CBM before enabling shipping payment for per_cbm rate." },
        { status: 400 }
      );
    }
    if (unit !== "per_cbm" && (!shipping_actual_weight_kg || shipping_actual_weight_kg <= 0)) {
      return NextResponse.json(
        { ok: false, error: "Provide actual weight (KG) before enabling shipping payment for per_kg rate." },
        { status: 400 }
      );
    }
  }

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureQuoteShippingControlColumns(conn);
    await ensureHandoffCountryColumns(conn);
    await ensureQuoteCountryColumns(conn);
    await backfillHandoffDefaults(conn);
    await backfillQuoteDefaults(conn);

    const allowed = await canAccessQuote(conn, auth.user, quoteId);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const exchange_rate_rmb = (await getFxRate(conn, "RMB", "NGN")) || 0;
    const exchange_rate_usd = (await getFxRate(conn, "USD", "NGN")) || 0;
    if (!exchange_rate_rmb || !exchange_rate_usd) {
      return NextResponse.json({ ok: false, error: "FX rates for NGN are not configured." }, { status: 500 });
    }

    const [settingsRows]: any = await conn.query(
      `SELECT service_charge_bands_json
       FROM linescout_settings
       ORDER BY id DESC
       LIMIT 1`
    );
    const bands = parseServiceChargeBands(settingsRows?.[0]?.service_charge_bands_json);
    const lineScoutMarginPercent = Math.max(0, markup_percent - agent_percent);

    let baseProductNgn = 0;
    for (const item of items) {
      const qty = num(item.quantity, 0);
      const unitPrice = num(item.unit_price_rmb, 0);
      baseProductNgn += qty * unitPrice * exchange_rate_rmb;
    }

    const [routeRows]: any = await conn.query(
      `SELECT c.route_type
              , q.display_currency_code
       FROM linescout_quotes q
       JOIN linescout_conversations c ON c.handoff_id = q.handoff_id
       WHERE q.id = ?
       ORDER BY c.id DESC
       LIMIT 1`,
      [quoteId]
    );
    const routeType = normalizeRouteType(routeRows?.[0]?.route_type || "");
    const isNgnQuote =
      String(routeRows?.[0]?.display_currency_code || "").trim().toUpperCase() === "NGN";
    const bandConfig = bands?.[routeType] || null;
    const bandCurrency = String(bandConfig?.currency || "GBP").trim().toUpperCase() || "GBP";
    let amountForBand = baseProductNgn;
    if (bandCurrency !== "NGN") {
      const fx = await getFxRate(conn, "NGN", bandCurrency);
      if (fx && fx > 0) {
        amountForBand = baseProductNgn * fx;
      }
    }
    const resolvedServiceCharge = resolveBandPercent(bands, routeType, amountForBand, lineScoutMarginPercent);
    const service_charge_percent = isNgnQuote
      ? 0
      : Math.max(0, Math.min(resolvedServiceCharge, lineScoutMarginPercent));

    const totals = computeTotals(
      items,
      exchange_rate_rmb,
      exchange_rate_usd,
      shipping_rate_usd,
      shipping_rate_unit,
      agent_percent,
      lineScoutMarginPercent,
      service_charge_percent,
      {
        weightKg: shipping_actual_weight_kg,
        cbm: shipping_actual_cbm,
        rateUsd: shipping_actual_rate_usd,
        rateUnit: shipping_actual_rate_unit,
      }
    );
    const [extraRows]: any = await conn.query(
      `SELECT total_addons_ngn, vat_rate_percent, shipping_payment_enabled, token, handoff_id
       FROM linescout_quotes
       WHERE id = ?
       LIMIT 1`,
      [quoteId]
    );
    const totalAddonsNgn = num(extraRows?.[0]?.total_addons_ngn, 0);
    const vatRate = num(extraRows?.[0]?.vat_rate_percent, 0);
    const previousShippingEnabled = !!extraRows?.[0]?.shipping_payment_enabled;
    const quoteToken = String(extraRows?.[0]?.token || "");
    const handoffIdFromQuote = Number(extraRows?.[0]?.handoff_id || 0);
    const vatBase = totals.totalMarkupNgn + totalAddonsNgn;
    const vatNgn = Math.max(0, Number(((vatBase * vatRate) / 100).toFixed(2)));
    const totalDueNgn = totals.totalDueNgn + totalAddonsNgn + vatNgn;
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
      shipping_payment_enabled ? 1 : 0,
      shipping_actual_weight_kg,
      shipping_actual_cbm,
      shipping_actual_rate_usd,
      shipping_actual_rate_unit,
      markup_percent,
      agent_percent,
      agent_commitment_percent,
      commitment_due_ngn,
      service_charge_percent,
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
      totalAddonsNgn,
      vatRate,
      vatNgn,
      totalDueNgn,
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
           shipping_payment_enabled = ?,
           shipping_actual_weight_kg = ?,
           shipping_actual_cbm = ?,
           shipping_actual_rate_usd = ?,
           shipping_actual_rate_unit = ?,
           markup_percent = ?,
           agent_percent = ?,
           agent_commitment_percent = ?,
           commitment_due_ngn = ?,
           service_charge_percent = ?,
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
           total_addons_ngn = ?,
           vat_rate_percent = ?,
           total_vat_ngn = ?,
           total_due_ngn = ?,
           updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      params
    );

    const [handoffRows]: any = await conn.query(
      `SELECT q.handoff_id, h.email, h.customer_name
       FROM linescout_quotes q
       LEFT JOIN linescout_handoffs h ON h.id = q.handoff_id
       WHERE q.id = ?
       LIMIT 1`,
      [quoteId]
    );
    const handoffId = Number(handoffRows?.[0]?.handoff_id || handoffIdFromQuote || 0);
    const customerEmail = String(handoffRows?.[0]?.email || "").trim();
    const customerName = String(handoffRows?.[0]?.customer_name || "").trim();

    if (!previousShippingEnabled && shipping_payment_enabled && customerEmail && quoteToken && handoffId) {
      const firstName = firstNameFromFullName(customerName);
      try {
        await sendNoticeEmail({
          to: customerEmail,
          subject: "Your Shipping Quote is Now Ready",
          title: "Your Shipping Quote is Now Ready",
          lines: [
            `Hello ${firstName},`,
            "",
            `Your shipping quote with token ${quoteToken} and Project ID ${handoffId} is now ready for payment.`,
            "",
            "Sign in to your account on LineScout to view the quote and make payment.",
            "",
            "Feel free to reply to this email if you have any questions about this quote.",
          ],
        });
      } catch {
        // Do not fail quote update if email delivery fails.
      }
    }

    if (handoffId) {
      // Keep handoff financials in sync with latest estimated landing cost
      await conn.query(
        `INSERT INTO linescout_handoff_financials (handoff_id, currency, total_due)
         VALUES (?, 'NGN', ?)
         ON DUPLICATE KEY UPDATE total_due = VALUES(total_due), currency = VALUES(currency)`,
        [handoffId, totalDueNgn]
      );
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
