import type { PoolConnection } from "mysql2/promise";

async function ensureColumn(conn: PoolConnection, table: string, column: string, definition: string) {
  const [rows]: any = await conn.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if (rows?.length) return;
  try {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (e?.errno === 1060 || msg.includes("Duplicate column name")) return;
    throw e;
  }
}

export async function ensureWhiteLabelSettings(conn: PoolConnection) {
  await ensureColumn(conn, "linescout_settings", "white_label_trial_days", "INT NOT NULL DEFAULT 3");
  await ensureColumn(conn, "linescout_settings", "white_label_daily_reveals", "INT NOT NULL DEFAULT 10");
  await ensureColumn(conn, "linescout_settings", "white_label_insights_daily_limit", "INT NOT NULL DEFAULT 2");
  await ensureColumn(conn, "linescout_settings", "white_label_monthly_price_gbp", "DECIMAL(10,2) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_yearly_price_gbp", "DECIMAL(10,2) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_monthly_price_cad", "DECIMAL(10,2) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_yearly_price_cad", "DECIMAL(10,2) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_subscription_countries", "VARCHAR(64) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_paypal_product_id", "VARCHAR(64) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_paypal_plan_monthly_gbp", "VARCHAR(64) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_paypal_plan_yearly_gbp", "VARCHAR(64) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_paypal_plan_monthly_cad", "VARCHAR(64) NULL");
  await ensureColumn(conn, "linescout_settings", "white_label_paypal_plan_yearly_cad", "VARCHAR(64) NULL");
}

export async function ensureWhiteLabelUserColumns(conn: PoolConnection) {
  await ensureColumn(conn, "users", "white_label_trial_ends_at", "DATETIME NULL");
  await ensureColumn(conn, "users", "white_label_plan", "VARCHAR(16) NULL");
  await ensureColumn(conn, "users", "white_label_subscription_status", "VARCHAR(16) NULL");
  await ensureColumn(conn, "users", "white_label_subscription_provider", "VARCHAR(16) NULL");
  await ensureColumn(conn, "users", "white_label_subscription_id", "VARCHAR(64) NULL");
  await ensureColumn(conn, "users", "white_label_reveals_date", "DATE NULL");
  await ensureColumn(conn, "users", "white_label_reveals_used", "INT NOT NULL DEFAULT 0");
  await ensureColumn(conn, "users", "white_label_insights_date", "DATE NULL");
  await ensureColumn(conn, "users", "white_label_insights_used", "INT NOT NULL DEFAULT 0");
}
