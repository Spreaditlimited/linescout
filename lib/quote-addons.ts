import type { PoolConnection } from "mysql2/promise";
import { getFxRate } from "@/lib/fx";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureColumn(conn: PoolConnection, table: string, column: string, type: string) {
  const [rows]: any = await conn.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if (!rows?.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export async function ensureQuoteAddonTables(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_quote_addons (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(160) NOT NULL,
      route_types_json TEXT NULL,
      country_ids_json TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_quote_addon_prices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      addon_id BIGINT UNSIGNED NOT NULL,
      currency_code VARCHAR(8) NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_quote_addon_price (addon_id, currency_code),
      KEY idx_quote_addon_price_addon (addon_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_quote_addon_lines (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      quote_id BIGINT UNSIGNED NOT NULL,
      addon_id BIGINT UNSIGNED NULL,
      title VARCHAR(160) NOT NULL,
      currency_code VARCHAR(8) NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      is_removed TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_quote_addon_line_quote (quote_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_vat_rates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      country_id INT NOT NULL,
      rate_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_vat_country (country_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureColumn(conn, "linescout_quotes", "total_addons_ngn", "DECIMAL(14,2) NOT NULL DEFAULT 0");
  await ensureColumn(conn, "linescout_quotes", "vat_rate_percent", "DECIMAL(6,2) NOT NULL DEFAULT 0");
  await ensureColumn(conn, "linescout_quotes", "total_vat_ngn", "DECIMAL(14,2) NOT NULL DEFAULT 0");
  await ensureColumn(conn, "linescout_quote_addon_lines", "is_removed", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn(conn, "linescout_quote_addons", "country_ids_json", "TEXT NULL");
}

const VALID_ROUTE_TYPES = new Set(["machine_sourcing", "simple_sourcing", "white_label"]);

export function normalizeRouteType(raw?: string | null) {
  const route = String(raw || "").trim().toLowerCase();
  return VALID_ROUTE_TYPES.has(route) ? route : "";
}

export async function listQuoteAddons(conn: PoolConnection) {
  await ensureQuoteAddonTables(conn);
  const [addons]: any = await conn.query(
    `SELECT id, title, route_types_json, country_ids_json, is_active, created_at, updated_at
     FROM linescout_quote_addons
     ORDER BY id DESC`
  );
  const [prices]: any = await conn.query(
    `SELECT addon_id, currency_code, amount
     FROM linescout_quote_addon_prices
     ORDER BY addon_id ASC`
  );
  return { addons: addons || [], prices: prices || [] };
}

export async function getActiveAddonsForRoute(conn: PoolConnection, routeType: string, countryId?: number | null) {
  await ensureQuoteAddonTables(conn);
  const route = normalizeRouteType(routeType);
  if (!route) return [];
  const targetCountryId = Number(countryId || 0);
  const [rows]: any = await conn.query(
    `SELECT id, title, route_types_json, country_ids_json
     FROM linescout_quote_addons
     WHERE is_active = 1`
  );
  const [prices]: any = await conn.query(
    `SELECT addon_id, currency_code, amount
     FROM linescout_quote_addon_prices`
  );

  const priceMap = new Map<string, { currency_code: string; amount: number }[]>();
  for (const p of prices || []) {
    const addonId = String(p.addon_id || "");
    const list = priceMap.get(addonId) || [];
    list.push({
      currency_code: String(p.currency_code || "").toUpperCase(),
      amount: num(p.amount, 0),
    });
    priceMap.set(addonId, list);
  }

  const addons = [];
  for (const row of rows || []) {
    let routes: string[] = [];
    if (row.route_types_json) {
      try {
        const parsed = typeof row.route_types_json === "string" ? JSON.parse(row.route_types_json) : row.route_types_json;
        if (Array.isArray(parsed)) routes = parsed.map((r) => String(r || "").toLowerCase());
      } catch {
        routes = [];
      }
    }
    if (routes.length && !routes.includes(route)) continue;
    let countries: number[] = [];
    if (row.country_ids_json) {
      try {
        const parsed = typeof row.country_ids_json === "string" ? JSON.parse(row.country_ids_json) : row.country_ids_json;
        if (Array.isArray(parsed)) countries = parsed.map((c) => Number(c)).filter((c) => Number.isFinite(c) && c > 0);
      } catch {
        countries = [];
      }
    }
    if (countries.length && targetCountryId && !countries.includes(targetCountryId)) continue;
    addons.push({
      id: Number(row.id),
      title: String(row.title || "").trim(),
      prices: priceMap.get(String(row.id)) || [],
    });
  }
  return addons;
}

export async function buildQuoteAddonLines(conn: PoolConnection, params: {
  route_type: string;
  currency_code: string;
  country_id?: number | null;
}) {
  const routeType = normalizeRouteType(params.route_type);
  const currency = String(params.currency_code || "NGN").toUpperCase();
  const addons = await getActiveAddonsForRoute(conn, routeType, params.country_id);

  const lines: Array<{ addon_id: number; title: string; currency_code: string; amount: number; amount_ngn: number }> = [];
  let totalNgn = 0;

  for (const addon of addons) {
    if (!addon.title) continue;
    const prices = addon.prices || [];
    const exact = prices.find((p) => p.currency_code === currency);
    let amount = exact?.amount ?? null;
    let amountCurrency = currency;

    if (amount == null) {
      const ngnPrice = prices.find((p) => p.currency_code === "NGN");
      if (ngnPrice && currency !== "NGN") {
        const fx = await getFxRate(conn, "NGN", currency);
        if (fx && fx > 0) {
          amount = Number((ngnPrice.amount * fx).toFixed(2));
          amountCurrency = currency;
        } else {
          continue;
        }
      } else if (ngnPrice) {
        amount = ngnPrice.amount;
        amountCurrency = "NGN";
      }
    }

    if (amount == null || !Number.isFinite(amount) || amount < 0) continue;

    let amountNgn = amount;
    if (amountCurrency !== "NGN") {
      const fxToNgn = await getFxRate(conn, amountCurrency, "NGN");
      if (!fxToNgn || fxToNgn <= 0) {
        continue;
      }
      amountNgn = Number((amount * fxToNgn).toFixed(2));
    }

    lines.push({
      addon_id: addon.id,
      title: addon.title,
      currency_code: amountCurrency,
      amount: Number(amount.toFixed(2)),
      amount_ngn: amountNgn,
    });
    totalNgn += amountNgn;
  }

  return { lines, total_ngn: Number(totalNgn.toFixed(2)) };
}

export async function getQuoteAddonLines(conn: PoolConnection, quoteId: number) {
  await ensureQuoteAddonTables(conn);
  const [rows]: any = await conn.query(
    `SELECT id, addon_id, title, currency_code, amount, is_removed
     FROM linescout_quote_addon_lines
     WHERE quote_id = ?
     ORDER BY id ASC`,
    [quoteId]
  );
  return rows || [];
}

export async function getVatRateForCountry(conn: PoolConnection, countryId: number | null) {
  await ensureQuoteAddonTables(conn);
  if (!countryId) return 0;
  const [rows]: any = await conn.query(
    `SELECT rate_percent
     FROM linescout_vat_rates
     WHERE country_id = ?
       AND is_active = 1
     LIMIT 1`,
    [countryId]
  );
  return num(rows?.[0]?.rate_percent, 0);
}
