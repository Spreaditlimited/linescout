import type { PoolConnection } from "mysql2/promise";

type Queryable = PoolConnection | { query: (sql: string, params?: any[]) => Promise<any> };

export type QuotePaymentProvider = "global" | "paypal" | "paystack" | "providus";

export async function ensureQuotePaymentProviderTable(conn: Queryable) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_quote_payment_providers (
      country_id INT PRIMARY KEY,
      provider VARCHAR(16) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function listQuotePaymentProviders(conn: Queryable) {
  await ensureQuotePaymentProviderTable(conn);
  const [rows]: any = await conn.query(
    `
    SELECT c.id AS country_id, c.name, c.iso2, c.is_active, qp.provider
    FROM linescout_countries c
    LEFT JOIN linescout_quote_payment_providers qp ON qp.country_id = c.id
    WHERE c.is_active = 1
    ORDER BY c.name ASC
    `
  );
  return rows || [];
}

export async function resolveQuotePaymentProvider(conn: Queryable, countryId: number | null | undefined) {
  if (!countryId) return null;
  await ensureQuotePaymentProviderTable(conn);
  const [rows]: any = await conn.query(
    `SELECT provider FROM linescout_quote_payment_providers WHERE country_id = ? LIMIT 1`,
    [countryId]
  );
  return rows?.[0]?.provider ? String(rows[0].provider) : null;
}

export async function upsertQuotePaymentProvider(
  conn: Queryable,
  countryId: number,
  provider: QuotePaymentProvider
) {
  await ensureQuotePaymentProviderTable(conn);
  await conn.query(
    `
    INSERT INTO linescout_quote_payment_providers (country_id, provider)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE provider = VALUES(provider)
    `,
    [countryId, provider]
  );
}

export async function deleteQuotePaymentProvider(conn: Queryable, countryId: number) {
  await ensureQuotePaymentProviderTable(conn);
  await conn.query(`DELETE FROM linescout_quote_payment_providers WHERE country_id = ?`, [countryId]);
}
