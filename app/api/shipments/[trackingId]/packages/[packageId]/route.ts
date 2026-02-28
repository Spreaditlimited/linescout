import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureShipmentTables } from "@/lib/shipments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ trackingId: string; packageId: string }> }
) {
  let userId = 0;
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { trackingId, packageId } = await context.params;
  const tracking = clean(trackingId);
  const pkgId = Number(packageId);
  if (!tracking || !pkgId) {
    return NextResponse.json({ ok: false, error: "Invalid tracking or package id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const title = clean(body?.title);
  const quantity = body?.quantity !== undefined ? Number(body.quantity) : null;
  const supplierName = clean(body?.supplier_name || "");
  const notes = clean(body?.notes || "");

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT p.id
      FROM linescout_shipment_packages p
      JOIN linescout_shipments s ON s.id = p.shipment_id
      WHERE p.id = ? AND s.public_tracking_id = ? AND s.user_id = ?
      LIMIT 1
      `,
      [pkgId, tracking, userId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (title) {
      updates.push("title = ?");
      params.push(title);
    }
    if (Number.isFinite(quantity)) {
      if (Number(quantity) <= 0) {
        return NextResponse.json({ ok: false, error: "Quantity must be greater than zero." }, { status: 400 });
      }
      updates.push("quantity = ?");
      params.push(quantity);
    }
    if (supplierName || supplierName === "") {
      updates.push("supplier_name = ?");
      params.push(supplierName || null);
    }
    if (notes || notes === "") {
      updates.push("notes = ?");
      params.push(notes || null);
    }

    if (!updates.length) {
      return NextResponse.json({ ok: true });
    }

    params.push(pkgId);
    await conn.query(
      `UPDATE linescout_shipment_packages SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ trackingId: string; packageId: string }> }
) {
  let userId = 0;
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { trackingId, packageId } = await context.params;
  const tracking = clean(trackingId);
  const pkgId = Number(packageId);
  if (!tracking || !pkgId) {
    return NextResponse.json({ ok: false, error: "Invalid tracking or package id." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT p.id
      FROM linescout_shipment_packages p
      JOIN linescout_shipments s ON s.id = p.shipment_id
      WHERE p.id = ? AND s.public_tracking_id = ? AND s.user_id = ?
      LIMIT 1
      `,
      [pkgId, tracking, userId]
    );
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    }

    await conn.query(`DELETE FROM linescout_shipment_packages WHERE id = ?`, [pkgId]);
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
