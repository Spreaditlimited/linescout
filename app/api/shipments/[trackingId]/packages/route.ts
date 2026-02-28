import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureShipmentTables } from "@/lib/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request, context: { params: Promise<{ trackingId: string }> }) {
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
  const title = clean(body?.title);
  const quantity = Number(body?.quantity || 1);
  const supplierName = clean(body?.supplier_name || "");
  const notes = clean(body?.notes || "");

  if (!title) {
    return NextResponse.json({ ok: false, error: "Package name is required." }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ ok: false, error: "Quantity must be greater than zero." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `SELECT id FROM linescout_shipments WHERE public_tracking_id = ? AND user_id = ? LIMIT 1`,
      [tracking, userId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }

    await conn.query(
      `
      INSERT INTO linescout_shipment_packages
      (shipment_id, title, quantity, supplier_name, status, notes)
      VALUES (?, ?, ?, ?, 'pending', ?)
      `,
      [shipment.id, title, quantity, supplierName || null, notes || null]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
