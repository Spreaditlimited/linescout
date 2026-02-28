import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureShipmentTables, statusLabel, type ShipmentStatus } from "@/lib/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const trackingId = String(url.searchParams.get("tracking_id") || "").trim();
  if (!trackingId) {
    return NextResponse.json({ ok: false, error: "Tracking ID is required." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_shipments
      WHERE public_tracking_id = ?
      LIMIT 1
      `,
      [trackingId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Tracking ID not found." }, { status: 404 });
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
    const events = (eventRows || []).map((e: any) => ({
      ...e,
      status_label: statusLabel(String(e.status || "created") as ShipmentStatus),
    }));

    return NextResponse.json({
      ok: true,
      shipment: {
        tracking_id: shipment.public_tracking_id,
        status: shipment.status || "created",
        status_label: statusLabel(String(shipment.status || "created") as ShipmentStatus),
        origin_country: shipment.origin_country,
        destination_country: shipment.destination_country,
        carrier: shipment.carrier,
        carrier_tracking_number: shipment.carrier_tracking_number,
        eta_date: shipment.eta_date,
        last_event_at: shipment.last_event_at,
      },
      events,
    });
  } finally {
    conn.release();
  }
}
