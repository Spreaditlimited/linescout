import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getFxRate } from "@/lib/fx";
import crypto from "crypto";
import {
  ensureCountryConfig,
  ensureQuoteCountryColumns,
  backfillQuoteDefaults,
  getNigeriaDefaults,
  resolveCountryCurrency,
} from "@/lib/country-config";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function getUserPhone(conn: any, emailRaw: string) {
  const email = String(emailRaw || "").trim();
  if (!email) return null;
  const [columns]: any = await conn.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('phone', 'ng_phone', 'whatsapp_number', 'whatsapp')
     `
  );
  const colSet = new Set((columns || []).map((c: any) => String(c.COLUMN_NAME || "")));
  if (!colSet.size) return null;

  const selectParts = ["email", "email_normalized"].concat(Array.from(colSet).map((c) => `u.${c}`));
  const [rows]: any = await conn.query(
    `SELECT ${selectParts.join(", ")}
     FROM users u
     WHERE u.email = ? OR u.email_normalized = ?
     LIMIT 1`,
    [email, email.toLowerCase()]
  );
  const row = rows?.[0];
  if (!row) return null;
  for (const col of ["phone", "ng_phone", "whatsapp_number", "whatsapp"]) {
    const val = row?.[col];
    if (val) return String(val).trim();
  }
  return null;
}

function computeTotals(
  items: any[],
  exchangeRmb: number,
  exchangeUsd: number,
  shippingRateUsd: number,
  shippingUnit: string,
  markupPercent: number
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

export async function POST(req: Request) {
  let userId = 0;
  let userEmail = "";
  try {
    const user = await requireUser(req);
    userId = user.id;
    userEmail = user.email;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const shipmentId = Number(body?.shipment_id || 0);
  if (!shipmentId) {
    return NextResponse.json({ ok: false, error: "shipment_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureQuoteCountryColumns(conn);
    await backfillQuoteDefaults(conn);
    await ensureShippingQuoteTables(conn);

    const [shipRows]: any = await conn.query(
      `SELECT * FROM linescout_shipments WHERE id = ? AND user_id = ? LIMIT 1`,
      [shipmentId, userId]
    );
    const shipment = shipRows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }

    const defaults = await getNigeriaDefaults(conn);
    let countryId = defaults.country_id;
    let displayCurrencyCode = defaults.display_currency_code;
    let settlementCurrencyCode = defaults.settlement_currency_code;

    if (shipment.destination_country_id) {
      const resolved = await resolveCountryCurrency(conn, shipment.destination_country_id, null);
      if (resolved) {
        countryId = resolved.country_id;
        displayCurrencyCode = resolved.display_currency_code;
        settlementCurrencyCode = resolved.settlement_currency_code;
      }
    }

    const exchangeRmb = (await getFxRate(conn, "RMB", "NGN")) || 0;
    const exchangeUsd = (await getFxRate(conn, "USD", "NGN")) || 0;
    if (!exchangeRmb || !exchangeUsd) {
      return NextResponse.json({ ok: false, error: "FX rates for NGN are not configured." }, { status: 500 });
    }

    const shippingRateUsd = num(shipment.shipping_rate_value, 0);
    const shippingRateUnit = String(shipment.shipping_rate_unit || "per_kg");
    const units = num(shipment.shipping_units, 0);
    if (!shippingRateUsd || !units) {
      return NextResponse.json({ ok: false, error: "Shipping rate and units are required." }, { status: 400 });
    }

    const items = [
      {
        product_name: "Shipping only",
        product_description: shipment.shipment_details || "Shipping only service",
        quantity: 1,
        unit_price_rmb: 0,
        unit_weight_kg: shippingRateUnit === "per_kg" ? units : 0,
        unit_cbm: shippingRateUnit === "per_cbm" ? units : 0,
        local_transport_rmb: 0,
      },
    ];

    const markupPercent = 0;
    const totals = computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent);
    const token = crypto.randomBytes(9).toString("hex");

    const userPhone = await getUserPhone(conn, userEmail || "");

    const insertColumns = [
      "token",
      "shipment_id",
      "status",
      "currency",
      "payment_purpose",
      "quote_type",
      "country_id",
      "display_currency_code",
      "settlement_currency_code",
      "exchange_rate_rmb",
      "exchange_rate_usd",
      "shipping_type_id",
      "shipping_rate_usd",
      "shipping_rate_unit",
      "markup_percent",
      "agent_percent",
      "agent_commitment_percent",
      "commitment_due_ngn",
      "deposit_enabled",
      "deposit_percent",
      "items_json",
      "total_product_rmb",
      "total_product_ngn",
      "total_weight_kg",
      "total_cbm",
      "total_shipping_usd",
      "total_shipping_ngn",
      "total_markup_ngn",
      "total_due_ngn",
      "created_by",
      "updated_by",
      "email",
      "customer_name",
      "customer_phone",
    ];
    const insertParams: any[] = [
      token,
      shipmentId,
      "draft",
      "NGN",
      "shipping_only",
      "shipping_only",
      countryId,
      displayCurrencyCode,
      settlementCurrencyCode,
      exchangeRmb,
      exchangeUsd,
      shipment.shipping_type_id || null,
      shippingRateUsd,
      shippingRateUnit,
      0,
      0,
      0,
      0,
      0,
      null,
      JSON.stringify(items),
      totals.totalProductRmb,
      totals.totalProductNgn,
      totals.totalWeightKg,
      totals.totalCbm,
      totals.totalShippingUsd,
      totals.totalShippingNgn,
      totals.totalMarkupNgn,
      totals.totalDueNgn,
      userId,
      userId,
      userEmail || null,
      userEmail ? userEmail.split("@")[0] : "Customer",
      userPhone || null,
    ];

    const insertValues = Array(insertColumns.length).fill("?").join(", ");

    await conn.query(
      `INSERT INTO linescout_shipping_quotes (${insertColumns.join(", ")}) VALUES (${insertValues})`,
      insertParams
    );
    await conn.query(`UPDATE linescout_shipments SET quote_token = ? WHERE id = ?`, [token, shipmentId]);

    return NextResponse.json({ ok: true, token });
  } finally {
    conn.release();
  }
}
