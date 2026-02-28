import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { ensureShipmentTables, normalizeStatus, type ShipmentStatus } from "@/lib/shipments";
import { getEasyPostTracker, trackerToEvents } from "@/lib/easypost";
import { sendShipmentStatusEmail } from "@/lib/shipment-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAgent(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const shipmentId = Number(id);
  if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid shipment ID." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(`SELECT * FROM linescout_shipments WHERE id = ? LIMIT 1`, [shipmentId]);
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }
    if (!shipment.provider_tracker_id) {
      return NextResponse.json({ ok: false, error: "No carrier tracker linked." }, { status: 400 });
    }

    const tracker = await getEasyPostTracker(String(shipment.provider_tracker_id));
    if (!tracker.ok) {
      return NextResponse.json({ ok: false, error: tracker.error || "Unable to sync tracker." }, { status: 500 });
    }

    const events = trackerToEvents(tracker.tracker);
    for (const event of events) {
      await conn.query(
        `
        INSERT INTO linescout_shipment_events
        (shipment_id, status, label, notes, event_time, source)
        VALUES (?, ?, ?, ?, ?, 'carrier_api')
        `,
        [shipment.id, event.status, event.label || null, event.notes || null, event.event_time]
      );
    }

    const status = normalizeStatus(tracker.tracker.status || "created");
    await conn.query(`UPDATE linescout_shipments SET status = ?, last_event_at = NOW() WHERE id = ?`, [
      status,
      shipment.id,
    ]);

    if (shipment.contact_email && process.env.STATUS_EMAILS_ENABLED !== "0") {
      await sendShipmentStatusEmail({
        to: String(shipment.contact_email || ""),
        trackingId: String(shipment.public_tracking_id || ""),
        status: status as ShipmentStatus,
        origin: shipment.origin_country,
        destination: shipment.destination_country,
      });
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
