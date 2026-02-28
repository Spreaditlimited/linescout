import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { ensureShipmentTables } from "@/lib/shipments";
import { sendShipmentUpdateEmail } from "@/lib/shipment-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hasUserColumn(conn: any, column: string) {
  const [rows]: any = await conn.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [column]
  );
  return !!rows?.length;
}

function clean(value: any) {
  return String(value || "").trim();
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
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
    const hasFirstName = await hasUserColumn(conn, "first_name");
    const hasLastName = await hasUserColumn(conn, "last_name");
    const selectParts = [
      "s.*",
      "u.email AS user_email",
      "u.display_name AS user_name",
      hasFirstName ? "u.first_name AS user_first_name" : "NULL AS user_first_name",
      hasLastName ? "u.last_name AS user_last_name" : "NULL AS user_last_name",
    ];
    const [rows]: any = await conn.query(
      `
      SELECT ${selectParts.join(", ")}
      FROM linescout_shipments s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
      `,
      [shipmentId]
    );
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }
    const [eventRows]: any = await conn.query(
      `SELECT * FROM linescout_shipment_events WHERE shipment_id = ? ORDER BY event_time DESC, id DESC`,
      [shipmentId]
    );
    const [changeRows]: any = await conn.query(
      `SELECT * FROM linescout_shipment_changes WHERE shipment_id = ? ORDER BY created_at DESC, id DESC`,
      [shipmentId]
    );
    const [packageRows]: any = await conn.query(
      `
      SELECT id, title, quantity, supplier_name, status, received_at, notes, created_at
      FROM linescout_shipment_packages
      WHERE shipment_id = ?
      ORDER BY created_at ASC, id ASC
      `,
      [shipmentId]
    );
    return NextResponse.json({ ok: true, shipment, events: eventRows || [], changes: changeRows || [], packages: packageRows || [] });
  } finally {
    conn.release();
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
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
  const fields = {
    origin_country: clean(body?.origin_country),
    destination_country: clean(body?.destination_country),
    carrier: clean(body?.carrier),
    carrier_tracking_number: clean(body?.carrier_tracking_number),
    contact_name: clean(body?.contact_name),
    contact_email: clean(body?.contact_email),
    shipment_details: clean(body?.shipment_details),
    shipping_rate_unit: clean(body?.shipping_rate_unit),
    estimated_shipping_currency: clean(body?.estimated_shipping_currency),
  };
  const destinationCountryId = body?.destination_country_id ? Number(body.destination_country_id) : null;
  const shippingTypeId = body?.shipping_type_id ? Number(body.shipping_type_id) : null;
  const shippingRateId = body?.shipping_rate_id ? Number(body.shipping_rate_id) : null;
  const shippingRateValue = body?.shipping_rate_value ? Number(body.shipping_rate_value) : null;
  const shippingUnits = body?.shipping_units ? Number(body.shipping_units) : null;
  const estimatedShippingUsd = body?.estimated_shipping_usd ? Number(body.estimated_shipping_usd) : null;
  const estimatedShippingAmount = body?.estimated_shipping_amount ? Number(body.estimated_shipping_amount) : null;
  const autoUpdatesPaused =
    typeof body?.auto_updates_paused === "boolean" ? (body.auto_updates_paused ? 1 : 0) : null;

  const conn = await db.getConnection();
  try {
    await ensureShipmentTables(conn);
    const [rows]: any = await conn.query(`SELECT * FROM linescout_shipments WHERE id = ? LIMIT 1`, [shipmentId]);
    const shipment = rows?.[0];
    if (!shipment) {
      return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
    }

    const updates: string[] = [];
    const params: any[] = [];
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

    const apply = (field: keyof typeof fields, value: string) => {
      if (!value && value !== "") return;
      if (String(shipment[field] || "") === value) return;
      updates.push(`${field} = ?`);
      params.push(value || null);
      changes.push({ field, oldValue: shipment[field], newValue: value || null });
    };

    (Object.keys(fields) as Array<keyof typeof fields>).forEach((field) => {
      apply(field, fields[field]);
    });

    const applyNumber = (field: string, value: number | null) => {
      if (!Number.isFinite(value)) return;
      if (Number(shipment[field] || 0) === Number(value || 0)) return;
      updates.push(`${field} = ?`);
      params.push(value);
      changes.push({ field, oldValue: shipment[field], newValue: value });
    };

    applyNumber("destination_country_id", destinationCountryId);
    applyNumber("shipping_type_id", shippingTypeId);
    applyNumber("shipping_rate_id", shippingRateId);
    applyNumber("shipping_rate_value", shippingRateValue);
    applyNumber("shipping_units", shippingUnits);
    applyNumber("estimated_shipping_usd", estimatedShippingUsd);
    applyNumber("estimated_shipping_amount", estimatedShippingAmount);

    if (autoUpdatesPaused !== null && Number(shipment.auto_updates_paused) !== autoUpdatesPaused) {
      updates.push(`auto_updates_paused = ?`);
      params.push(autoUpdatesPaused);
      changes.push({ field: "auto_updates_paused", oldValue: shipment.auto_updates_paused, newValue: autoUpdatesPaused });
    }

    if (!updates.length) {
      return NextResponse.json({ ok: true, shipment });
    }

    await conn.query(`UPDATE linescout_shipments SET ${updates.join(", ")} WHERE id = ?`, [
      ...params,
      shipmentId,
    ]);

    if (changes.length) {
      const inserts = changes.map(() => "(?, ?, ?, ?, ?, 'admin', NOW())").join(", ");
      const flat: any[] = [];
      changes.forEach((c) => {
        flat.push(shipmentId, c.field, c.oldValue ?? null, c.newValue ?? null, staff?.id ?? null);
      });
      await conn.query(
        `
        INSERT INTO linescout_shipment_changes
        (shipment_id, field_name, old_value, new_value, changed_by_internal_user_id, source, created_at)
        VALUES ${inserts}
        `,
        flat
      );
    }

    const [freshRows]: any = await conn.query(`SELECT * FROM linescout_shipments WHERE id = ? LIMIT 1`, [
      shipmentId,
    ]);
    if (changes.length && process.env.STATUS_EMAILS_ENABLED !== "0") {
      let to = String(shipment.contact_email || "").trim();
      if (!to && shipment.user_id) {
        const [uRows]: any = await conn.query(`SELECT email FROM users WHERE id = ? LIMIT 1`, [shipment.user_id]);
        to = String(uRows?.[0]?.email || "").trim();
      }
      if (to) {
        const label = (field: string) =>
          field
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
        const lines = changes.map(
          (c) => `${label(c.field)}: ${c.oldValue ?? "—"} → ${c.newValue ?? "—"}`
        );
        const [pkgRows]: any = await conn.query(
          `SELECT title, quantity, status FROM linescout_shipment_packages WHERE shipment_id = ? ORDER BY created_at ASC, id ASC`,
          [shipmentId]
        );
        const received = (pkgRows || []).filter((p: any) => String(p.status || "") === "received");
        const missing = (pkgRows || []).filter((p: any) => String(p.status || "") === "missing");
        const pending = (pkgRows || []).filter((p: any) =>
          !["received", "missing"].includes(String(p.status || ""))
        );
        const fmt = (p: any) => `${p.title || "Package"} (Qty ${p.quantity || 0})`;
        if (pkgRows?.length) {
          if (!pending.length && !missing.length) {
            lines.push("Packages: All received.");
            lines.push(`Received: ${received.map(fmt).join(", ")}`);
          } else {
            if (received.length) lines.push(`Received: ${received.map(fmt).join(", ")}`);
            if (missing.length) lines.push(`Missing: ${missing.map(fmt).join(", ")}`);
            if (pending.length) lines.push(`Pending: ${pending.map(fmt).join(", ")}`);
          }
        }
        await sendShipmentUpdateEmail({
          to,
          trackingId: String(shipment.public_tracking_id || ""),
          title: "Shipment details updated",
          lines,
          origin: shipment.origin_country,
          destination: shipment.destination_country,
        });
      }
    }
    return NextResponse.json({ ok: true, shipment: freshRows?.[0] || shipment });
  } finally {
    conn.release();
  }
}
