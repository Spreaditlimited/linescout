export async function ensureQuoteShippingControlColumns(conn: any) {
  const [cols]: any = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'linescout_quotes'
       AND column_name IN (
         'shipping_payment_enabled',
         'shipping_actual_weight_kg',
         'shipping_actual_cbm',
         'shipping_actual_rate_usd',
         'shipping_actual_rate_unit'
       )`
  );

  const has = new Set((cols || []).map((r: any) => String(r.COLUMN_NAME || "")));

  if (!has.has("shipping_payment_enabled")) {
    await conn.query(
      `ALTER TABLE linescout_quotes
       ADD COLUMN shipping_payment_enabled TINYINT(1) NOT NULL DEFAULT 0`
    );
  }
  if (!has.has("shipping_actual_weight_kg")) {
    await conn.query(
      `ALTER TABLE linescout_quotes
       ADD COLUMN shipping_actual_weight_kg DECIMAL(12,3) NULL`
    );
  }
  if (!has.has("shipping_actual_cbm")) {
    await conn.query(
      `ALTER TABLE linescout_quotes
       ADD COLUMN shipping_actual_cbm DECIMAL(12,3) NULL`
    );
  }
  if (!has.has("shipping_actual_rate_usd")) {
    await conn.query(
      `ALTER TABLE linescout_quotes
       ADD COLUMN shipping_actual_rate_usd DECIMAL(14,4) NULL`
    );
  }
  if (!has.has("shipping_actual_rate_unit")) {
    await conn.query(
      `ALTER TABLE linescout_quotes
       ADD COLUMN shipping_actual_rate_unit VARCHAR(16) NULL`
    );
  }
}
