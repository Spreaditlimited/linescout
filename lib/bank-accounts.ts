import type { PoolConnection } from "mysql2/promise";
import { getNigeriaDefaults } from "@/lib/country-config";

type Queryable = PoolConnection | { query: (sql: string, params?: any[]) => Promise<any> };

async function ensureColumn(
  conn: Queryable,
  column: string,
  definition: string
) {
  const [rows]: any = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'linescout_bank_accounts'
       AND column_name = ?
     LIMIT 1`,
    [column]
  );
  if (!rows?.length) {
    await conn.query(`ALTER TABLE linescout_bank_accounts ADD COLUMN ${column} ${definition}`);
  }
}

export async function ensureBankAccountCountryColumns(conn: Queryable) {
  await ensureColumn(conn, "country_id", "INT NULL");
  await ensureColumn(conn, "currency_code", "VARCHAR(8) NULL");
  await ensureColumn(conn, "sort_code", "VARCHAR(16) NULL");
  await ensureColumn(conn, "iban", "VARCHAR(64) NULL");
  await ensureColumn(conn, "swift_bic", "VARCHAR(32) NULL");

  const defaults = await getNigeriaDefaults(conn);
  if (!defaults.country_id) return;

  await conn.query(
    `UPDATE linescout_bank_accounts
     SET country_id = COALESCE(country_id, ?),
         currency_code = COALESCE(NULLIF(TRIM(currency_code), ''), 'NGN')
     WHERE country_id IS NULL
        OR currency_code IS NULL
        OR TRIM(currency_code) = ''`,
    [defaults.country_id]
  );
}

