import { db } from "@/lib/db";

type Queryable = {
  query: (sql: string, params?: any[]) => Promise<any>;
};

function getQueryable(conn?: Queryable): Queryable {
  return conn || db;
}

async function ensureColumn(
  conn: Queryable,
  table: string,
  column: string,
  type: string
) {
  const [rows]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    LIMIT 1
    `,
    [table, column]
  );
  if (!rows?.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export async function ensureCountryTables(conn?: Queryable) {
  const q = getQueryable(conn);
  await q.query(`
    CREATE TABLE IF NOT EXISTS linescout_currencies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(8) NOT NULL,
      symbol VARCHAR(8) NULL,
      decimal_places INT NOT NULL DEFAULT 2,
      display_format VARCHAR(16) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_currency_code (code)
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS linescout_countries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      iso2 VARCHAR(2) NOT NULL,
      iso3 VARCHAR(3) NULL,
      default_currency_id INT NULL,
      settlement_currency_code VARCHAR(8) NULL,
      payment_provider VARCHAR(32) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_country_iso2 (iso2)
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS linescout_country_currencies (
      country_id INT NOT NULL,
      currency_id INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (country_id, currency_id)
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS linescout_fx_rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      base_currency_code VARCHAR(8) NOT NULL,
      quote_currency_code VARCHAR(8) NOT NULL,
      rate DECIMAL(18,8) NOT NULL,
      effective_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function ensureSeedCurrencies(conn?: Queryable) {
  const q = getQueryable(conn);
  const seed = [
    { code: "NGN", symbol: "₦", decimal_places: 0 },
    { code: "GBP", symbol: "£", decimal_places: 2 },
    { code: "USD", symbol: "$", decimal_places: 2 },
    { code: "RMB", symbol: "¥", decimal_places: 2 },
  ];

  for (const c of seed) {
    await q.query(
      `INSERT INTO linescout_currencies (code, symbol, decimal_places)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE code = code`,
      [c.code, c.symbol, c.decimal_places]
    );
  }
}

export async function ensureSeedCountries(conn?: Queryable) {
  const q = getQueryable(conn);
  const [rows]: any = await q.query(
    `SELECT id, code FROM linescout_currencies WHERE code IN ('NGN', 'GBP')`
  );
  const byCode = new Map<string, number>();
  for (const r of rows || []) byCode.set(String(r.code || "").toUpperCase(), Number(r.id));

  const ngnId = byCode.get("NGN") || null;
  const gbpId = byCode.get("GBP") || null;

  const seed = [
    {
      name: "Nigeria",
      iso2: "NG",
      iso3: "NGA",
      default_currency_id: ngnId,
      settlement_currency_code: "NGN",
      payment_provider: "paystack",
    },
    {
      name: "United Kingdom",
      iso2: "GB",
      iso3: "GBR",
      default_currency_id: gbpId,
      settlement_currency_code: "GBP",
      payment_provider: "paypal",
    },
  ];

  for (const c of seed) {
    await q.query(
      `INSERT INTO linescout_countries (name, iso2, iso3, default_currency_id, settlement_currency_code, payment_provider)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         iso3 = VALUES(iso3),
         default_currency_id = VALUES(default_currency_id),
         settlement_currency_code = VALUES(settlement_currency_code),
         payment_provider = VALUES(payment_provider)`,
      [
        c.name,
        c.iso2,
        c.iso3,
        c.default_currency_id,
        c.settlement_currency_code,
        c.payment_provider,
      ]
    );
  }

  if (ngnId) {
    const [ng]: any = await q.query(`SELECT id FROM linescout_countries WHERE iso2 = 'NG' LIMIT 1`);
    if (ng?.[0]?.id) {
      await q.query(
        `INSERT INTO linescout_country_currencies (country_id, currency_id, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [ng[0].id, ngnId]
      );
    }
  }

  if (gbpId) {
    const [gb]: any = await q.query(`SELECT id FROM linescout_countries WHERE iso2 = 'GB' LIMIT 1`);
    if (gb?.[0]?.id) {
      await q.query(
        `INSERT INTO linescout_country_currencies (country_id, currency_id, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [gb[0].id, gbpId]
      );
    }
  }
}

export async function ensureCountryConfig(conn?: Queryable) {
  await ensureCountryTables(conn);
  await ensureSeedCurrencies(conn);
  await ensureSeedCountries(conn);
}

export async function getNigeriaDefaults(conn?: Queryable) {
  const q = getQueryable(conn);
  const [rows]: any = await q.query(
    `SELECT c.id AS country_id, cur.code AS currency_code, c.settlement_currency_code
     FROM linescout_countries c
     LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
     WHERE c.iso2 = 'NG'
     LIMIT 1`
  );
  const row = rows?.[0] || {};
  return {
    country_id: Number(row.country_id || 0),
    display_currency_code: String(row.currency_code || "NGN"),
    settlement_currency_code: String(row.settlement_currency_code || "NGN"),
  };
}

export async function ensureUserCountryColumns(conn?: Queryable) {
  const q = getQueryable(conn);
  await ensureColumn(q, "users", "country_id", "INT NULL");
  await ensureColumn(q, "users", "display_currency_code", "VARCHAR(8) NULL");
}

export async function ensureHandoffCountryColumns(conn?: Queryable) {
  const q = getQueryable(conn);
  await ensureColumn(q, "linescout_handoffs", "country_id", "INT NULL");
  await ensureColumn(q, "linescout_handoffs", "display_currency_code", "VARCHAR(8) NULL");
  await ensureColumn(q, "linescout_handoffs", "settlement_currency_code", "VARCHAR(8) NULL");
}

export async function ensureQuoteCountryColumns(conn?: Queryable) {
  const q = getQueryable(conn);
  await ensureColumn(q, "linescout_quotes", "country_id", "INT NULL");
  await ensureColumn(q, "linescout_quotes", "display_currency_code", "VARCHAR(8) NULL");
  await ensureColumn(q, "linescout_quotes", "settlement_currency_code", "VARCHAR(8) NULL");
}

export async function ensureWhiteLabelCountryColumns(conn?: Queryable) {
  const q = getQueryable(conn);
  await ensureColumn(q, "linescout_white_label_projects", "country_id", "INT NULL");
  await ensureColumn(q, "linescout_white_label_projects", "display_currency_code", "VARCHAR(8) NULL");
}

export async function ensureShippingRateCountryColumn(conn?: Queryable) {
  const q = getQueryable(conn);
  await ensureColumn(q, "linescout_shipping_rates", "country_id", "INT NULL");
  const defaults = await getNigeriaDefaults(q);
  if (!defaults.country_id) return;
  await q.query(
    `UPDATE linescout_shipping_rates
     SET country_id = COALESCE(country_id, ?)
     WHERE country_id IS NULL`,
    [defaults.country_id]
  );
}

export async function backfillUserDefaults(conn?: Queryable) {
  const q = getQueryable(conn);
  const defaults = await getNigeriaDefaults(q);
  if (!defaults.country_id) return defaults;
  await q.query(
    `UPDATE users
     SET country_id = COALESCE(country_id, ?),
         display_currency_code = COALESCE(display_currency_code, ?)
     WHERE country_id IS NULL OR display_currency_code IS NULL`,
    [defaults.country_id, defaults.display_currency_code]
  );
  return defaults;
}

export async function backfillHandoffDefaults(conn?: Queryable) {
  const q = getQueryable(conn);
  const defaults = await getNigeriaDefaults(q);
  if (!defaults.country_id) return defaults;
  await q.query(
    `UPDATE linescout_handoffs
     SET country_id = COALESCE(country_id, ?),
         display_currency_code = COALESCE(display_currency_code, ?),
         settlement_currency_code = COALESCE(settlement_currency_code, ?)
     WHERE country_id IS NULL OR display_currency_code IS NULL OR settlement_currency_code IS NULL`,
    [defaults.country_id, defaults.display_currency_code, defaults.settlement_currency_code]
  );
  return defaults;
}

export async function backfillQuoteDefaults(conn?: Queryable) {
  const q = getQueryable(conn);
  const defaults = await getNigeriaDefaults(q);
  if (!defaults.country_id) return defaults;
  await q.query(
    `UPDATE linescout_quotes
     SET country_id = COALESCE(country_id, ?),
         display_currency_code = COALESCE(display_currency_code, ?),
         settlement_currency_code = COALESCE(settlement_currency_code, ?)
     WHERE country_id IS NULL OR display_currency_code IS NULL OR settlement_currency_code IS NULL`,
    [defaults.country_id, defaults.display_currency_code, defaults.settlement_currency_code]
  );
  return defaults;
}

export async function backfillWhiteLabelDefaults(conn?: Queryable) {
  const q = getQueryable(conn);
  const defaults = await getNigeriaDefaults(q);
  if (!defaults.country_id) return defaults;
  await q.query(
    `UPDATE linescout_white_label_projects
     SET country_id = COALESCE(country_id, ?),
         display_currency_code = COALESCE(display_currency_code, ?)
     WHERE country_id IS NULL OR display_currency_code IS NULL`,
    [defaults.country_id, defaults.display_currency_code]
  );
  return defaults;
}

export async function listActiveCountriesAndCurrencies(conn?: Queryable) {
  const q = getQueryable(conn);
  const [countries]: any = await q.query(
    `SELECT id, name, iso2, iso3, default_currency_id, settlement_currency_code, payment_provider, is_active
     FROM linescout_countries
     WHERE is_active = 1
     ORDER BY name ASC`
  );
  const [currencies]: any = await q.query(
    `SELECT id, code, symbol, decimal_places, display_format, is_active
     FROM linescout_currencies
     WHERE is_active = 1
     ORDER BY code ASC`
  );
  const [countryCurrencies]: any = await q.query(
    `SELECT country_id, currency_id, is_active
     FROM linescout_country_currencies
     WHERE is_active = 1`
  );
  return {
    countries: countries || [],
    currencies: currencies || [],
    country_currencies: countryCurrencies || [],
  };
}

export async function resolveCountryCurrency(
  conn: Queryable,
  countryId: number | null | undefined,
  displayCurrencyCode?: string | null
) {
  if (!countryId) return null;
  const [rows]: any = await conn.query(
    `SELECT c.id AS country_id, cur.code AS default_currency_code, c.settlement_currency_code
     FROM linescout_countries c
     LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
     WHERE c.id = ?
     LIMIT 1`,
    [countryId]
  );
  if (!rows?.length) return null;
  const row = rows[0];
  return {
    country_id: Number(row.country_id || 0),
    display_currency_code: displayCurrencyCode || String(row.default_currency_code || "NGN"),
    settlement_currency_code: String(row.settlement_currency_code || "NGN"),
  };
}
