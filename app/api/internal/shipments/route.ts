import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { createEasyPostTracker } from "@/lib/easypost";
import { ensureShipmentTables, generateTrackingId, normalizeStatus } from "@/lib/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    await requireAgent(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"));
  const status = clean(url.searchParams.get("status"));

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const clauses: string[] = [];
    const params: any[] = [];
    if (q) {
      clauses.push(
        `(public_tracking_id LIKE ? OR carrier_tracking_number LIKE ? OR contact_email LIKE ? OR contact_name LIKE ?)`
      );
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (status) {
      clauses.push(`status = ?`);
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_shipments
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT 200
      `,
      params
    );
    return NextResponse.json({ ok: true, shipments: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  let staff: { id: number; role: string } | null = null;
  try {
    staff = await requireAgent(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const originCountry = clean(body?.origin_country);
  const destinationCountry = clean(body?.destination_country);
  const carrier = clean(body?.carrier);
  const carrierTrackingNumber = clean(body?.carrier_tracking_number);
  const sourceType = clean(body?.source_type) || "shipping_only";
  const sourceId = body?.source_id ? Number(body.source_id) : null;
  const contactEmail = clean(body?.contact_email);
  const contactName = clean(body?.contact_name);
  const status = normalizeStatus(body?.status || "created");

  if (!originCountry || !destinationCountry) {
    return NextResponse.json({ ok: false, error: "Origin and destination are required." }, { status: 400 });
  }

  const trackingProvider = carrierTrackingNumber ? "easypost" : "manual";

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const trackingId = generateTrackingId();
    const [res]: any = await conn.query(
      `
      INSERT INTO linescout_shipments
      (public_tracking_id, user_id, source_type, source_id, contact_name, contact_email,
       origin_country, destination_country, carrier, carrier_tracking_number, tracking_provider, status, last_event_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        trackingId,
        sourceType,
        sourceId,
        contactName || null,
        contactEmail || null,
        originCountry,
        destinationCountry,
        carrier || null,
        carrierTrackingNumber || null,
        trackingProvider,
        status,
      ]
    );
    const shipmentId = Number(res?.insertId || 0);
    await conn.query(
      `
      INSERT INTO linescout_shipment_events
      (shipment_id, status, label, notes, event_time, source, created_by_internal_user_id)
      VALUES (?, ?, ?, ?, NOW(), 'system', ?)
      `,
      [shipmentId, status, null, "Shipment created.", staff?.id ?? null]
    );

    if (carrierTrackingNumber) {
      const tracker = await createEasyPostTracker({
        trackingCode: carrierTrackingNumber,
        carrier: carrier || null,
      });
      if (tracker.ok) {
        await conn.query(
          `UPDATE linescout_shipments SET provider_tracker_id = ?, tracking_provider = 'easypost' WHERE id = ?`,
          [tracker.tracker.id, shipmentId]
        );
      }
    }

    return NextResponse.json({ ok: true, tracking_id: trackingId });
  } finally {
    conn.release();
  }
}
