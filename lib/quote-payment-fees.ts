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

export async function ensureQuotePaymentMethodSupportsManual(conn: any) {
  const [rows]: any = await conn.query(
    `SELECT DATA_TYPE, COLUMN_TYPE
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'linescout_quote_payments'
       AND column_name = 'method'
     LIMIT 1`
  );
  const row = rows?.[0];
  if (!row) return;

  const dataType = String(row.DATA_TYPE || "").toLowerCase();
  const columnType = String(row.COLUMN_TYPE || "");
  if (dataType !== "enum") return;

  const matches = Array.from(columnType.matchAll(/'([^']*)'/g));
  const values = matches.map((m) => String(m[1] || "").trim()).filter(Boolean);
  if (!values.length || values.includes("manual")) return;

  const next = [...values, "manual"];
  const enumSql = next.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  await conn.query(
    `ALTER TABLE linescout_quote_payments
     MODIFY COLUMN method ENUM(${enumSql}) NOT NULL`
  );
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
