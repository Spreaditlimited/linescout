import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureShipmentTables, normalizeStatus, type ShipmentStatus } from "@/lib/shipments";
import { trackerToEvents } from "@/lib/easypost";
import { sendShipmentStatusEmail } from "@/lib/shipment-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const tracker = payload?.result || payload?.tracker || payload;
  const trackerId = String(tracker?.id || "").trim();
  if (!trackerId) {
    return NextResponse.json({ ok: false, error: "Missing tracker id." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_shipments WHERE provider_tracker_id = ? LIMIT 1`,
      [trackerId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (Number(shipment.auto_updates_paused) === 1) {
      return NextResponse.json({ ok: true, paused: true });
    }

    const events = trackerToEvents(tracker);
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

    const lastStatus = normalizeStatus(tracker?.status || "created");
    await conn.query(`UPDATE linescout_shipments SET status = ?, last_event_at = NOW() WHERE id = ?`, [
      lastStatus,
      shipment.id,
    ]);

    if (shipment.contact_email && process.env.STATUS_EMAILS_ENABLED !== "0") {
      await sendShipmentStatusEmail({
        to: String(shipment.contact_email || ""),
        trackingId: String(shipment.public_tracking_id || ""),
        status: lastStatus as ShipmentStatus,
        origin: shipment.origin_country,
        destination: shipment.destination_country,
      });
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
