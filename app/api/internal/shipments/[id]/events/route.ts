import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { ensureShipmentTables, normalizeStatus, type ShipmentStatus } from "@/lib/shipments";
import { sendShipmentStatusEmail } from "@/lib/shipment-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  let staff: { id: number; role: string } | null = null;
  try {
    staff = await requireAgent(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const shipmentId = Number(id);
  if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid shipment ID." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const status = normalizeStatus(body?.status || "created");
  const label = clean(body?.label);
  const notes = clean(body?.notes);
  const eventTimeRaw = clean(body?.event_time);
  const eventTime = eventTimeRaw ? new Date(eventTimeRaw) : new Date();
  const safeTime = Number.isNaN(eventTime.valueOf()) ? new Date() : eventTime;

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(`SELECT * FROM linescout_shipments WHERE id = ? LIMIT 1`, [shipmentId]);
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }
    await conn.query(
      `
      INSERT INTO linescout_shipment_events
      (shipment_id, status, label, notes, event_time, source, created_by_internal_user_id)
      VALUES (?, ?, ?, ?, ?, 'manual', ?)
      `,
      [shipmentId, status, label || null, notes || null, safeTime, staff?.id ?? null]
    );
    await conn.query(
      `UPDATE linescout_shipments SET status = ?, last_event_at = ? WHERE id = ?`,
      [status, safeTime, shipmentId]
    );

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
