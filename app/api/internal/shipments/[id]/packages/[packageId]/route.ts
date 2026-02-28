import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { ensureShipmentTables } from "@/lib/shipments";
import { sendShipmentUpdateEmail } from "@/lib/shipment-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value || "").trim();
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; packageId: string }> }
) {
  try {
    await requireAgent(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id, packageId } = await context.params;
  const shipmentId = Number(id);
  const pkgId = Number(packageId);
  if (!shipmentId || !pkgId) {
    return NextResponse.json({ ok: false, error: "Invalid shipment or package id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const title = clean(body?.title);
  const quantity = body?.quantity !== undefined ? Number(body.quantity) : null;
  const supplierName = clean(body?.supplier_name || "");
  const notes = clean(body?.notes || "");
  const status = clean(body?.status || "");
  const receivedAt = clean(body?.received_at || "");

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(
      `
      SELECT p.*, s.public_tracking_id, s.contact_email, s.user_id, s.origin_country, s.destination_country,
             u.email AS user_email
      FROM linescout_shipment_packages p
      JOIN linescout_shipments s ON s.id = p.shipment_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE p.id = ? AND p.shipment_id = ?
      LIMIT 1
      `,
      [pkgId, shipmentId]
    );
    const pkg = rows?.[0];
    if (!pkg) {
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
    if (status) {
      updates.push("status = ?");
      params.push(status);
      if (status === "received") {
        updates.push("received_at = ?");
        params.push(receivedAt ? new Date(receivedAt) : new Date());
      }
    }

    if (!updates.length) {
      return NextResponse.json({ ok: true });
    }

    params.push(pkgId);
    await conn.query(
      `UPDATE linescout_shipment_packages SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    if (process.env.STATUS_EMAILS_ENABLED !== "0") {
      const to = String(pkg.contact_email || pkg.user_email || "").trim();
      if (to) {
        const changed: string[] = [];
        if (title) changed.push(`Package: ${pkg.title || "Package"} → ${title}`);
        if (Number.isFinite(quantity)) changed.push(`Quantity: ${pkg.quantity ?? "—"} → ${quantity}`);
        if (supplierName || supplierName === "") {
          changed.push(`Supplier: ${pkg.supplier_name || "—"} → ${supplierName || "—"}`);
        }
        if (notes || notes === "") changed.push(`Notes updated.`);
        if (status) {
          changed.push(`Status: ${pkg.status || "—"} → ${status}`);
          if (status === "received") changed.push("Package marked as received.");
          if (status === "missing") changed.push("Package marked as missing.");
        }

        const [allRows]: any = await conn.query(
          `SELECT title, quantity, status FROM linescout_shipment_packages WHERE shipment_id = ? ORDER BY created_at ASC, id ASC`,
          [shipmentId]
        );
        const received = (allRows || []).filter((p: any) => String(p.status || "") === "received");
        const missing = (allRows || []).filter((p: any) => String(p.status || "") === "missing");
        const pending = (allRows || []).filter((p: any) =>
          !["received", "missing"].includes(String(p.status || ""))
        );
        const fmt = (p: any) => `${p.title || "Package"} (Qty ${p.quantity || 0})`;
        if (allRows?.length) {
          if (!pending.length && !missing.length) {
            changed.push("Packages: All received.");
            changed.push(`Received: ${received.map(fmt).join(", ")}`);
          } else {
            if (received.length) changed.push(`Received: ${received.map(fmt).join(", ")}`);
            if (missing.length) changed.push(`Missing: ${missing.map(fmt).join(", ")}`);
            if (pending.length) changed.push(`Pending: ${pending.map(fmt).join(", ")}`);
          }
        }

        await sendShipmentUpdateEmail({
          to,
          trackingId: String(pkg.public_tracking_id || ""),
          title: "Shipment package updated",
          lines: changed.length ? changed : ["Package details updated."],
          origin: pkg.origin_country,
          destination: pkg.destination_country,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
