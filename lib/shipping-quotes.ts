import type { PoolConnection } from "mysql2/promise";

type Queryable = PoolConnection | { query: (sql: string, params?: any[]) => Promise<any> };

export async function ensureShippingQuoteTables(conn: Queryable) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipping_quotes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      token VARCHAR(64) NOT NULL,
      shipment_id INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
      payment_purpose VARCHAR(32) NOT NULL DEFAULT 'shipping_only',
      quote_type VARCHAR(40) NULL,
      country_id INT NULL,
      display_currency_code VARCHAR(8) NULL,
      settlement_currency_code VARCHAR(8) NULL,
      exchange_rate_rmb DECIMAL(12,4) NULL,
      exchange_rate_usd DECIMAL(12,4) NULL,
      shipping_type_id INT NULL,
      shipping_rate_usd DECIMAL(12,4) NULL,
      shipping_rate_unit VARCHAR(16) NULL,
      markup_percent DECIMAL(6,2) NULL,
      agent_percent DECIMAL(6,2) NULL,
      agent_commitment_percent DECIMAL(6,2) NULL,
      commitment_due_ngn DECIMAL(14,2) NULL,
      deposit_enabled TINYINT(1) NOT NULL DEFAULT 0,
      deposit_percent DECIMAL(6,2) NULL,
      items_json JSON NULL,
      total_product_rmb DECIMAL(14,2) NULL,
      total_product_ngn DECIMAL(14,2) NULL,
      total_weight_kg DECIMAL(14,4) NULL,
      total_cbm DECIMAL(14,4) NULL,
      total_shipping_usd DECIMAL(14,2) NULL,
      total_shipping_ngn DECIMAL(14,2) NULL,
      total_markup_ngn DECIMAL(14,2) NULL,
      total_due_ngn DECIMAL(14,2) NULL,
      created_by INT NULL,
      updated_by INT NULL,
      email VARCHAR(200) NULL,
      customer_name VARCHAR(200) NULL,
      customer_phone VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_shipping_quote_token (token),
      KEY idx_shipping_quote_shipment (shipment_id)
    )
  `);

  const ensureColumn = async (column: string, type: string) => {
    const [rows]: any = await conn.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_shipping_quotes'
        AND column_name = ?
      LIMIT 1
      `,
      [column]
    );
    if (!rows?.length) {
      await conn.query(`ALTER TABLE linescout_shipping_quotes ADD COLUMN ${column} ${type}`);
    }
  };

  await ensureColumn("customer_phone", "VARCHAR(64) NULL");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_shipping_quote_payments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      shipping_quote_id INT NOT NULL,
      user_id INT NULL,
      purpose VARCHAR(32) NOT NULL,
      method VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      currency VARCHAR(8) NOT NULL,
      provider_ref VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      paid_at DATETIME NULL,
      KEY idx_shipping_quote_payment (shipping_quote_id),
      KEY idx_shipping_quote_provider (provider_ref)
    )
  `);
}
