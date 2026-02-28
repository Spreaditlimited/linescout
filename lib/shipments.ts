import crypto from "crypto";
import type { PoolConnection } from "mysql2/promise";

export type ShipmentStatus =
  | "created"
  | "picked_up"
  | "departed_origin"
  | "arrived_destination"
  | "customs"
  | "out_for_delivery"
  | "ready_for_pickup"
  | "delivered"
  | "exception"
  | "shipped";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: "Created",
  picked_up: "Picked up",
  departed_origin: "Departed origin",
  arrived_destination: "Arrived destination",
  customs: "Customs",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready for pickup",
  delivered: "Delivered",
  exception: "Exception",
  shipped: "Shipped",
};

export function normalizeStatus(input: string | null | undefined): ShipmentStatus {
  const raw = String(input || "").trim().toLowerCase();
  switch (raw) {
    case "created":
    case "picked_up":
    case "departed_origin":
    case "arrived_destination":
    case "customs":
    case "out_for_delivery":
    case "ready_for_pickup":
    case "delivered":
    case "exception":
    case "shipped":
      return raw as ShipmentStatus;
    default:
      return "created";
  }
}

export async function ensureShipmentTables(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      public_tracking_id VARCHAR(40) NOT NULL,
      user_id INT NULL,
      source_type VARCHAR(32) NOT NULL DEFAULT 'shipping_only',
      source_id INT NULL,
      contact_name VARCHAR(160) NULL,
      contact_email VARCHAR(200) NULL,
      origin_country VARCHAR(120) NULL,
      destination_country VARCHAR(120) NULL,
      carrier VARCHAR(120) NULL,
      carrier_tracking_number VARCHAR(160) NULL,
      shipment_details TEXT NULL,
      destination_country_id INT NULL,
      shipping_type_id INT NULL,
      shipping_rate_id INT NULL,
      shipping_rate_unit VARCHAR(16) NULL,
      shipping_rate_value DECIMAL(12,4) NULL,
      shipping_units DECIMAL(12,4) NULL,
      estimated_shipping_usd DECIMAL(14,2) NULL,
      estimated_shipping_amount DECIMAL(14,2) NULL,
      estimated_shipping_currency VARCHAR(8) NULL,
      tracking_provider VARCHAR(40) NOT NULL DEFAULT 'manual',
      provider_tracker_id VARCHAR(120) NULL,
      quote_token VARCHAR(64) NULL,
      status VARCHAR(32) NULL,
      last_event_at DATETIME NULL,
      eta_date DATE NULL,
      auto_updates_paused TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_public_tracking_id (public_tracking_id),
      KEY idx_user_id (user_id),
      KEY idx_source (source_type, source_id),
      KEY idx_provider_tracker (provider_tracker_id)
    )
  `);

  const ensureColumn = async (column: string, type: string) => {
    const [rows]: any = await conn.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_shipments'
        AND column_name = ?
      LIMIT 1
      `,
      [column]
    );
    if (!rows?.length) {
      await conn.query(`ALTER TABLE linescout_shipments ADD COLUMN ${column} ${type}`);
    }
  };

  await ensureColumn("shipment_details", "TEXT NULL");
  await ensureColumn("destination_country_id", "INT NULL");
  await ensureColumn("shipping_type_id", "INT NULL");
  await ensureColumn("shipping_rate_id", "INT NULL");
  await ensureColumn("shipping_rate_unit", "VARCHAR(16) NULL");
  await ensureColumn("shipping_rate_value", "DECIMAL(12,4) NULL");
  await ensureColumn("shipping_units", "DECIMAL(12,4) NULL");
  await ensureColumn("estimated_shipping_usd", "DECIMAL(14,2) NULL");
  await ensureColumn("estimated_shipping_amount", "DECIMAL(14,2) NULL");
  await ensureColumn("estimated_shipping_currency", "VARCHAR(8) NULL");
  await ensureColumn("quote_token", "VARCHAR(64) NULL");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipment_events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shipment_id INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      label VARCHAR(160) NULL,
      notes TEXT NULL,
      event_time DATETIME NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'system',
      created_by_user_id INT NULL,
      created_by_internal_user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_shipment_id (shipment_id),
      KEY idx_event_time (event_time)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipment_packages (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shipment_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      supplier_name VARCHAR(200) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      received_at DATETIME NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_shipment_id (shipment_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipment_changes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shipment_id INT NOT NULL,
      field_name VARCHAR(120) NOT NULL,
      old_value TEXT NULL,
      new_value TEXT NULL,
      changed_by_user_id INT NULL,
      changed_by_internal_user_id INT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'system',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_shipment_id (shipment_id),
      KEY idx_created_at (created_at)
    )
  `);
}

export function generateTrackingId() {
  const seed = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `LS-TRK-${seed}`;
}

export function statusLabel(status: ShipmentStatus) {
  return SHIPMENT_STATUS_LABELS[status] || "Updated";
}
