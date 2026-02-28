import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createEasyPostTracker } from "@/lib/easypost";
import { ensureShipmentTables, generateTrackingId, normalizeStatus } from "@/lib/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      await ensureShipmentTables(conn);
      const [rows]: any = await conn.query(
        `
        SELECT public_tracking_id, status, origin_country, destination_country, carrier,
               carrier_tracking_number, tracking_provider, eta_date, last_event_at, created_at
        FROM linescout_shipments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        `,
        [user.id]
      );
      return NextResponse.json({ ok: true, shipments: rows || [] });
    } finally {
      conn.release();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
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
  const originCountry = clean(body?.origin_country);
  const destinationCountry = clean(body?.destination_country);
  const destinationCountryId = body?.destination_country_id ? Number(body.destination_country_id) : null;
  const carrier = clean(body?.carrier);
  const carrierTrackingNumber = clean(body?.carrier_tracking_number);
  const trackingProviderRaw = clean(body?.tracking_provider || "");
  const shipmentDetails = clean(body?.shipment_details || "");
  const requestedStatus = clean(body?.status || "");
  const packages = Array.isArray(body?.packages) ? body.packages : [];
  const shippingTypeId = body?.shipping_type_id ? Number(body.shipping_type_id) : null;
  const shippingRateId = body?.shipping_rate_id ? Number(body.shipping_rate_id) : null;
  const shippingRateUnit = clean(body?.shipping_rate_unit || "");
  const shippingRateValue = body?.shipping_rate_value ? Number(body.shipping_rate_value) : null;
  const shippingUnits = body?.shipping_units ? Number(body.shipping_units) : null;
  const estimatedShippingUsd = body?.estimated_shipping_usd ? Number(body.estimated_shipping_usd) : null;
  const estimatedShippingAmount = body?.estimated_shipping_amount ? Number(body.estimated_shipping_amount) : null;
  const estimatedShippingCurrency = clean(body?.estimated_shipping_currency || "");

  const status = requestedStatus === "draft" ? "draft" : "created";
  if (status !== "draft" && (!originCountry || !destinationCountry)) {
    return NextResponse.json({ ok: false, error: "Origin and destination are required." }, { status: 400 });
  }

  const hasExternalTracking = !!carrierTrackingNumber;
  const trackingProvider = hasExternalTracking ? trackingProviderRaw || "easypost" : "manual";

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const trackingId = generateTrackingId();
    const resolvedCarrierTrackingNumber = hasExternalTracking ? carrierTrackingNumber : trackingId;

    const [res]: any = await conn.query(
      `
      INSERT INTO linescout_shipments
      (public_tracking_id, user_id, source_type, source_id, contact_email, origin_country, destination_country,
       destination_country_id, carrier, carrier_tracking_number, shipment_details,
       shipping_type_id, shipping_rate_id, shipping_rate_unit, shipping_rate_value, shipping_units,
       estimated_shipping_usd, estimated_shipping_amount, estimated_shipping_currency,
       tracking_provider, status, last_event_at)
      VALUES (?, ?, 'shipping_only', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        trackingId,
        userId,
        userEmail || null,
        originCountry || null,
        destinationCountry || null,
        destinationCountryId,
        carrier || null,
        resolvedCarrierTrackingNumber || null,
        shipmentDetails || null,
        shippingTypeId,
        shippingRateId,
        shippingRateUnit || null,
        Number.isFinite(shippingRateValue) ? shippingRateValue : null,
        Number.isFinite(shippingUnits) ? shippingUnits : null,
        Number.isFinite(estimatedShippingUsd) ? estimatedShippingUsd : null,
        Number.isFinite(estimatedShippingAmount) ? estimatedShippingAmount : null,
        estimatedShippingCurrency || null,
        trackingProvider,
        status,
      ]
    );

    const shipmentId = Number(res?.insertId || 0);
    if (shipmentId && packages.length) {
      const rows = packages
        .map((pkg: any) => {
          const title = clean(pkg?.title);
          const quantity = Number(pkg?.quantity || 0);
          if (!title || !Number.isFinite(quantity) || quantity <= 0) return null;
          const supplierName = clean(pkg?.supplier_name || "");
          const notes = clean(pkg?.notes || "");
          return [shipmentId, title, quantity, supplierName || null, "pending", notes || null];
        })
        .filter(Boolean) as any[];
      if (rows.length) {
        const values = rows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
        const flat: any[] = [];
        rows.forEach((r) => flat.push(...r));
        await conn.query(
          `
          INSERT INTO linescout_shipment_packages
          (shipment_id, title, quantity, supplier_name, status, notes)
          VALUES ${values}
          `,
          flat
        );
      }
    }
    await conn.query(
      `
      INSERT INTO linescout_shipment_events
      (shipment_id, status, label, notes, event_time, source, created_by_user_id)
      VALUES (?, ?, ?, ?, NOW(), 'system', ?)
      `,
      [shipmentId, status, null, status === "draft" ? "Shipment saved as draft." : "Shipment created.", userId]
    );

    let providerError: any = null;
    if (hasExternalTracking && trackingProvider === "easypost") {
      const tracker = await createEasyPostTracker({
        trackingCode: carrierTrackingNumber,
        carrier: carrier || null,
      });
      if (tracker.ok) {
        await conn.query(
          `UPDATE linescout_shipments SET provider_tracker_id = ?, tracking_provider = 'easypost' WHERE id = ?`,
          [tracker.tracker.id, shipmentId]
        );
        const status = normalizeStatus(tracker.tracker.status || "created");
        await conn.query(
          `
          INSERT INTO linescout_shipment_events
          (shipment_id, status, label, notes, event_time, source)
          VALUES (?, ?, ?, ?, NOW(), 'carrier_api')
          `,
          [shipmentId, status, null, "Carrier tracking linked."]
        );
        await conn.query(`UPDATE linescout_shipments SET status = ?, last_event_at = NOW() WHERE id = ?`, [
          status,
          shipmentId,
        ]);
      } else {
        providerError = tracker.error;
      }
    }

    return NextResponse.json({
      ok: true,
      shipment_id: shipmentId,
      tracking_id: trackingId,
      provider_error: providerError,
    });
  } finally {
    conn.release();
  }
}
