import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createEasyPostTracker } from "@/lib/easypost";
import { ensureShipmentTables, normalizeStatus } from "@/lib/shipments";
import { ensureShippingQuoteTables } from "@/lib/shipping-quotes";
import { getFxRate } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

function num(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

export async function GET(req: Request, context: { params: Promise<{ trackingId: string }> }) {
  try {
    const user = await requireUser(req);
    const { trackingId } = await context.params;
    const tracking = clean(trackingId);
    if (!tracking) {
      return NextResponse.json({ ok: false, error: "Tracking ID is required." }, { status: 400 });
    }
    const conn = await db.getConnection();
    try {
      await ensureShipmentTables(conn);
      const [rows]: any = await conn.query(
        `
        SELECT *
        FROM linescout_shipments
        WHERE public_tracking_id = ? AND user_id = ?
        LIMIT 1
        `,
        [tracking, user.id]
      );
      const shipment = rows?.[0];
      if (!shipment) {
        return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
      }
      const [eventRows]: any = await conn.query(
        `
        SELECT status, label, notes, event_time, source
        FROM linescout_shipment_events
        WHERE shipment_id = ?
        ORDER BY event_time DESC, id DESC
        `,
        [shipment.id]
      );
      const [packageRows]: any = await conn.query(
        `
        SELECT id, title, quantity, supplier_name, status, received_at, notes, created_at
        FROM linescout_shipment_packages
        WHERE shipment_id = ?
        ORDER BY created_at ASC, id ASC
        `,
        [shipment.id]
      );
      return NextResponse.json({ ok: true, shipment, events: eventRows || [], packages: packageRows || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ trackingId: string }> }) {
  let userId = 0;
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { trackingId } = await context.params;
  const tracking = clean(trackingId);
  if (!tracking) {
    return NextResponse.json({ ok: false, error: "Tracking ID is required." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const originCountry = clean(body?.origin_country);
  const destinationCountry = clean(body?.destination_country);
  const destinationCountryId = body?.destination_country_id ? Number(body.destination_country_id) : null;
  const carrier = clean(body?.carrier);
  const carrierTrackingNumber = clean(body?.carrier_tracking_number);
  const shipmentDetails = clean(body?.shipment_details || "");
  const requestedStatus = clean(body?.status || "");
  const shippingTypeId = body?.shipping_type_id ? Number(body.shipping_type_id) : null;
  const shippingRateId = body?.shipping_rate_id ? Number(body.shipping_rate_id) : null;
  const shippingRateUnit = clean(body?.shipping_rate_unit || "");
  const shippingRateValue = body?.shipping_rate_value ? Number(body.shipping_rate_value) : null;
  const shippingUnits = body?.shipping_units ? Number(body.shipping_units) : null;
  const estimatedShippingUsd = body?.estimated_shipping_usd ? Number(body.estimated_shipping_usd) : null;
  const estimatedShippingAmount = body?.estimated_shipping_amount ? Number(body.estimated_shipping_amount) : null;
  const estimatedShippingCurrency = clean(body?.estimated_shipping_currency || "");
  const etaDate = clean(body?.eta_date);

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_shipments
      WHERE public_tracking_id = ? AND user_id = ?
      LIMIT 1
      `,
      [tracking, userId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }
    if (shipment.source_type !== "shipping_only") {
      return NextResponse.json({ ok: false, error: "This shipment cannot be edited." }, { status: 403 });
    }

    const updates: string[] = [];
    const params: any[] = [];
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

    const applyChange = (field: string, newValue: any) => {
      const oldValue = shipment[field];
      if (String(oldValue || "") === String(newValue || "")) return;
      updates.push(`${field} = ?`);
      params.push(newValue || null);
      changes.push({ field, oldValue, newValue });
    };

    if (originCountry) applyChange("origin_country", originCountry);
    if (destinationCountry) applyChange("destination_country", destinationCountry);
    if (Number.isFinite(destinationCountryId)) applyChange("destination_country_id", destinationCountryId);
    if (carrier || carrier === "") applyChange("carrier", carrier || null);
    if (shipmentDetails || shipmentDetails === "") applyChange("shipment_details", shipmentDetails || null);
    if (Number.isFinite(shippingTypeId)) applyChange("shipping_type_id", shippingTypeId);
    if (Number.isFinite(shippingRateId)) applyChange("shipping_rate_id", shippingRateId);
    if (shippingRateUnit || shippingRateUnit === "") applyChange("shipping_rate_unit", shippingRateUnit || null);
    if (Number.isFinite(shippingRateValue)) applyChange("shipping_rate_value", shippingRateValue);
    if (Number.isFinite(shippingUnits)) applyChange("shipping_units", shippingUnits);
    if (Number.isFinite(estimatedShippingUsd)) applyChange("estimated_shipping_usd", estimatedShippingUsd);
    if (Number.isFinite(estimatedShippingAmount)) applyChange("estimated_shipping_amount", estimatedShippingAmount);
    if (estimatedShippingCurrency || estimatedShippingCurrency === "")
      applyChange("estimated_shipping_currency", estimatedShippingCurrency || null);
    if (carrierTrackingNumber || carrierTrackingNumber === "") {
      applyChange("carrier_tracking_number", carrierTrackingNumber || null);
      applyChange("tracking_provider", carrierTrackingNumber ? "easypost" : "manual");
    }
    if (etaDate) applyChange("eta_date", etaDate);
    if (requestedStatus && requestedStatus !== shipment.status) {
      const nextStatus = requestedStatus === "created" ? "created" : requestedStatus === "draft" ? "draft" : "";
      if (nextStatus) applyChange("status", nextStatus);
    }

    if (!updates.length) {
      return NextResponse.json({ ok: true, shipment });
    }

    await conn.query(
      `UPDATE linescout_shipments SET ${updates.join(", ")} WHERE id = ?`,
      [...params, shipment.id]
    );

    if (changes.length) {
      const inserts = changes.map(() => "(?, ?, ?, ?, ?, 'user', NOW())").join(", ");
      const flat: any[] = [];
      changes.forEach((c) => {
        flat.push(shipment.id, c.field, c.oldValue ?? null, c.newValue ?? null, userId);
      });
      await conn.query(
        `
        INSERT INTO linescout_shipment_changes
        (shipment_id, field_name, old_value, new_value, changed_by_user_id, source, created_at)
        VALUES ${inserts}
        `,
        flat
      );
    }

    if (carrierTrackingNumber) {
      const tracker = await createEasyPostTracker({
        trackingCode: carrierTrackingNumber,
        carrier: carrier || shipment.carrier || null,
      });
      if (tracker.ok) {
        await conn.query(
          `UPDATE linescout_shipments SET provider_tracker_id = ?, tracking_provider = 'easypost' WHERE id = ?`,
          [tracker.tracker.id, shipment.id]
        );
        const status = normalizeStatus(tracker.tracker.status || "created");
        await conn.query(
          `
          INSERT INTO linescout_shipment_events
          (shipment_id, status, label, notes, event_time, source, created_by_user_id)
          VALUES (?, ?, ?, ?, NOW(), 'carrier_api', ?)
          `,
          [shipment.id, status, null, "Carrier tracking linked.", userId]
        );
        await conn.query(`UPDATE linescout_shipments SET status = ?, last_event_at = NOW() WHERE id = ?`, [
          status,
          shipment.id,
        ]);
      }
    }

    const [freshRows]: any = await conn.query(
      `SELECT * FROM linescout_shipments WHERE id = ? LIMIT 1`,
      [shipment.id]
    );
    const freshShipment = freshRows?.[0] || shipment;

    const shouldSyncQuote =
      !!freshShipment.quote_token &&
      changes.some((c) =>
        [
          "shipping_rate_value",
          "shipping_rate_unit",
          "shipping_units",
          "shipping_type_id",
          "shipment_details",
        ].includes(c.field)
      );

    if (shouldSyncQuote) {
      await ensureShippingQuoteTables(conn);
      const [quoteRows]: any = await conn.query(
        `SELECT * FROM linescout_shipping_quotes WHERE token = ? LIMIT 1`,
        [freshShipment.quote_token]
      );
      const quote = quoteRows?.[0];
      if (quote) {
        const exchangeRmb = num(quote.exchange_rate_rmb, 0) || (await getFxRate(conn, "RMB", "NGN")) || 0;
        const exchangeUsd = num(quote.exchange_rate_usd, 0) || (await getFxRate(conn, "USD", "NGN")) || 0;
        const shippingRateUsd = num(freshShipment.shipping_rate_value, 0);
        const shippingRateUnit = String(freshShipment.shipping_rate_unit || "per_kg");
        const units = num(freshShipment.shipping_units, 0);
        const items = [
          {
            product_name: "Shipping only",
            product_description: freshShipment.shipment_details || "Shipping only service",
            quantity: 1,
            unit_price_rmb: 0,
            unit_weight_kg: shippingRateUnit === "per_kg" ? units : 0,
            unit_cbm: shippingRateUnit === "per_cbm" ? units : 0,
            local_transport_rmb: 0,
          },
        ];

        if (exchangeRmb > 0 && exchangeUsd > 0 && shippingRateUsd > 0 && units > 0) {
          const totals = computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, 0);
          await conn.query(
            `
            UPDATE linescout_shipping_quotes
            SET shipping_type_id = ?,
                shipping_rate_usd = ?,
                shipping_rate_unit = ?,
                items_json = ?,
                total_product_rmb = ?,
                total_product_ngn = ?,
                total_weight_kg = ?,
                total_cbm = ?,
                total_shipping_usd = ?,
                total_shipping_ngn = ?,
                total_markup_ngn = ?,
                total_due_ngn = ?,
                updated_at = NOW()
            WHERE id = ?
            `,
            [
              freshShipment.shipping_type_id || null,
              shippingRateUsd,
              shippingRateUnit,
              JSON.stringify(items),
              totals.totalProductRmb,
              totals.totalProductNgn,
              totals.totalWeightKg,
              totals.totalCbm,
              totals.totalShippingUsd,
              totals.totalShippingNgn,
              totals.totalMarkupNgn,
              totals.totalDueNgn,
              quote.id,
            ]
          );
        } else {
          await conn.query(
            `
            UPDATE linescout_shipping_quotes
            SET shipping_type_id = ?,
                shipping_rate_usd = ?,
                shipping_rate_unit = ?,
                items_json = ?,
                updated_at = NOW()
            WHERE id = ?
            `,
            [
              freshShipment.shipping_type_id || null,
              shippingRateUsd || null,
              shippingRateUnit || null,
              JSON.stringify(items),
              quote.id,
            ]
          );
        }
      }
    }

    return NextResponse.json({ ok: true, shipment: freshShipment });
  } finally {
    conn.release();
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ trackingId: string }> }) {
  let userId = 0;
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { trackingId } = await context.params;
  const tracking = clean(trackingId);
  if (!tracking) {
    return NextResponse.json({ ok: false, error: "Tracking ID is required." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT id, status, source_type
      FROM linescout_shipments
      WHERE public_tracking_id = ? AND user_id = ?
      LIMIT 1
      `,
      [tracking, userId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }
    if (String(shipment.source_type || "") !== "shipping_only") {
      return NextResponse.json({ ok: false, error: "This shipment cannot be deleted." }, { status: 403 });
    }
    if (String(shipment.status || "") !== "draft") {
      return NextResponse.json({ ok: false, error: "Only draft shipments can be deleted." }, { status: 400 });
    }

    await conn.query(`DELETE FROM linescout_shipment_packages WHERE shipment_id = ?`, [shipment.id]);
    await conn.query(`DELETE FROM linescout_shipment_events WHERE shipment_id = ?`, [shipment.id]);
    await conn.query(`DELETE FROM linescout_shipment_changes WHERE shipment_id = ?`, [shipment.id]);
    await conn.query(`DELETE FROM linescout_shipments WHERE id = ?`, [shipment.id]);

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
