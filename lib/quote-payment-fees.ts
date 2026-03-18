export async function ensureQuotePaymentFeeColumns(conn: any) {
  const columns = [
    { name: "base_amount", ddl: "DECIMAL(14,2) NULL AFTER amount" },
    { name: "processing_fee_amount", ddl: "DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER base_amount" },
    { name: "processing_fee_meta_json", ddl: "JSON NULL AFTER processing_fee_amount" },
  ] as const;

  for (const col of columns) {
    const [rows]: any = await conn.query(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'linescout_quote_payments'
         AND column_name = ?
       LIMIT 1`,
      [col.name]
    );
    if (!rows?.length) {
      await conn.query(`ALTER TABLE linescout_quote_payments ADD COLUMN ${col.name} ${col.ddl}`);
    }
  }
}

export async function ensureShippingQuotePaymentFeeColumns(conn: any) {
  const columns = [
    { name: "base_amount", ddl: "DECIMAL(14,2) NULL AFTER amount" },
    { name: "processing_fee_amount", ddl: "DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER base_amount" },
    { name: "processing_fee_meta_json", ddl: "JSON NULL AFTER processing_fee_amount" },
  ] as const;

  for (const col of columns) {
    const [rows]: any = await conn.query(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'linescout_shipping_quote_payments'
         AND column_name = ?
       LIMIT 1`,
      [col.name]
    );
    if (!rows?.length) {
      await conn.query(`ALTER TABLE linescout_shipping_quote_payments ADD COLUMN ${col.name} ${col.ddl}`);
    }
  }
}
