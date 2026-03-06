import type { PoolConnection } from "mysql2/promise";
import { getFxRate } from "@/lib/fx";
import { WHITE_LABEL_PRICING_DEFAULTS } from "@/lib/white-label-products";

export type ShippingRateUnit = "per_cbm" | "per_kg";

type SeaRate = {
  country_id: number;
  currency_code: string;
  rate_value: number;
  rate_unit: ShippingRateUnit;
};

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function ensureWhiteLabelLandedCostTable(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_white_label_landed_costs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      country_id INT NOT NULL,
      currency_code VARCHAR(8) NOT NULL,
      freight_per_unit DECIMAL(14,4) NULL,
      landed_per_unit_low DECIMAL(14,4) NULL,
      landed_per_unit_high DECIMAL(14,4) NULL,
      landed_total_1000_low DECIMAL(18,2) NULL,
      landed_total_1000_high DECIMAL(18,2) NULL,
      computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_product_country (product_id, country_id),
      KEY idx_country (country_id),
      KEY idx_product (product_id)
    )
  `);
}

async function listSeaRates(conn: PoolConnection, countryId?: number | null): Promise<SeaRate[]> {
  const params: any[] = [];
  const where: string[] = ["r.is_active = 1", "t.name = 'Sea'", "c.is_active = 1"];
  if (countryId) {
    where.push("c.id = ?");
    params.push(countryId);
  }
  const [rows]: any = await conn.query(
    `
    SELECT
      c.id AS country_id,
      cur.code AS currency_code,
      r.rate_value,
      r.rate_unit
    FROM linescout_shipping_rates r
    JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
    JOIN linescout_countries c ON c.id = r.country_id
    LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
    WHERE ${where.join(" AND ")}
    ORDER BY c.id ASC, r.id DESC
    `,
    params
  );

  const picked = new Map<number, SeaRate>();
  for (const row of rows || []) {
    const id = Number(row.country_id || 0);
    if (!id || picked.has(id)) continue;
    const rateValue = Number(row.rate_value || 0);
    const rateUnit = String(row.rate_unit || "") as ShippingRateUnit;
    if (!Number.isFinite(rateValue) || rateValue <= 0) continue;
    if (rateUnit !== "per_cbm" && rateUnit !== "per_kg") continue;
    picked.set(id, {
      country_id: id,
      currency_code: String(row.currency_code || "USD").toUpperCase(),
      rate_value: rateValue,
      rate_unit: rateUnit,
    });
  }
  return Array.from(picked.values());
}

function computeLanded(params: {
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  volumetric_kg_per_1000: number | null;
  rate_value: number;
  rate_unit: ShippingRateUnit;
  fx_rate: number;
  markup_percent: number;
}) {
  const fobLow = toNumber(params.fob_low_usd);
  const fobHigh = toNumber(params.fob_high_usd);
  const cbm = toNumber(params.cbm_per_1000);
  const volKg = toNumber(params.volumetric_kg_per_1000);

  if (fobLow == null || fobHigh == null) {
    return {
      freight_per_unit: null,
      landed_per_unit_low: null,
      landed_per_unit_high: null,
      landed_total_1000_low: null,
      landed_total_1000_high: null,
    };
  }

  let freightPerUnitUsd: number | null = null;
  if (params.rate_unit === "per_cbm") {
    if (cbm != null) freightPerUnitUsd = (cbm * params.rate_value) / 1000;
  } else {
    if (volKg != null) freightPerUnitUsd = (volKg * params.rate_value) / 1000;
  }

  if (freightPerUnitUsd == null) {
    return {
      freight_per_unit: null,
      landed_per_unit_low: null,
      landed_per_unit_high: null,
      landed_total_1000_low: null,
      landed_total_1000_high: null,
    };
  }

  const fx = params.fx_rate;
  const freightPerUnit = freightPerUnitUsd * fx;
  const landedLowRaw = (fobLow + freightPerUnitUsd) * fx * (1 + params.markup_percent);
  const landedLow = landedLowRaw * 0.5;
  const landedHigh = (fobHigh + freightPerUnitUsd) * fx * (1 + params.markup_percent);

  return {
    freight_per_unit: freightPerUnit,
    landed_per_unit_low: landedLow,
    landed_per_unit_high: landedHigh,
    landed_total_1000_low: landedLow * 1000,
    landed_total_1000_high: landedHigh * 1000,
  };
}

async function upsertLandedRows(
  conn: PoolConnection,
  countryId: number,
  currencyCode: string,
  rate: SeaRate,
  products: any[]
) {
  const fx = currencyCode === "USD" ? 1 : await getFxRate(conn, "USD", currencyCode);
  if (!fx || !Number.isFinite(fx)) {
    await conn.query(
      `DELETE FROM linescout_white_label_landed_costs WHERE country_id = ?`,
      [countryId]
    );
    return;
  }

  const markup = WHITE_LABEL_PRICING_DEFAULTS.markup_percent;

  const values: any[] = [];
  const rows: string[] = [];

  for (const p of products) {
    const computed = computeLanded({
      fob_low_usd: p.fob_low_usd,
      fob_high_usd: p.fob_high_usd,
      cbm_per_1000: p.cbm_per_1000,
      volumetric_kg_per_1000: p.volumetric_kg_per_1000,
      rate_value: rate.rate_value,
      rate_unit: rate.rate_unit,
      fx_rate: fx,
      markup_percent: markup,
    });

    rows.push("(?, ?, ?, ?, ?, ?, ?, ?)");
    values.push(
      p.id,
      countryId,
      currencyCode,
      computed.freight_per_unit,
      computed.landed_per_unit_low,
      computed.landed_per_unit_high,
      computed.landed_total_1000_low,
      computed.landed_total_1000_high
    );
  }

  if (!rows.length) return;

  await conn.query(
    `
    INSERT INTO linescout_white_label_landed_costs
      (product_id, country_id, currency_code, freight_per_unit, landed_per_unit_low, landed_per_unit_high, landed_total_1000_low, landed_total_1000_high)
    VALUES
      ${rows.join(", ")}
    ON DUPLICATE KEY UPDATE
      currency_code = VALUES(currency_code),
      freight_per_unit = VALUES(freight_per_unit),
      landed_per_unit_low = VALUES(landed_per_unit_low),
      landed_per_unit_high = VALUES(landed_per_unit_high),
      landed_total_1000_low = VALUES(landed_total_1000_low),
      landed_total_1000_high = VALUES(landed_total_1000_high),
      computed_at = CURRENT_TIMESTAMP
    `,
    values
  );
}

export async function recomputeWhiteLabelLandedCostsForCountry(
  conn: PoolConnection,
  countryId: number
) {
  await ensureWhiteLabelLandedCostTable(conn);

  const [countryRows]: any = await conn.query(
    `
    SELECT c.id, cur.code AS currency_code
    FROM linescout_countries c
    LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [countryId]
  );
  const country = countryRows?.[0];
  if (!country?.id) return;

  const rates = await listSeaRates(conn, countryId);
  const rate = rates.find((r) => r.country_id === countryId);
  if (!rate) {
    await conn.query(
      `DELETE FROM linescout_white_label_landed_costs WHERE country_id = ?`,
      [countryId]
    );
    return;
  }

  const currencyCode = String(country.currency_code || "USD").toUpperCase();
  const [products]: any = await conn.query(
    `
    SELECT id, fob_low_usd, fob_high_usd, cbm_per_1000, volumetric_kg_per_1000
    FROM linescout_white_label_products
    WHERE is_active = 1
    `
  );
  await upsertLandedRows(conn, countryId, currencyCode, rate, products || []);
}

export async function recomputeWhiteLabelLandedCostsForProduct(
  conn: PoolConnection,
  productId: number
) {
  await ensureWhiteLabelLandedCostTable(conn);

  const [productRows]: any = await conn.query(
    `
    SELECT id, fob_low_usd, fob_high_usd, cbm_per_1000, volumetric_kg_per_1000
    FROM linescout_white_label_products
    WHERE id = ?
    LIMIT 1
    `,
    [productId]
  );
  const product = productRows?.[0];
  if (!product?.id) return;

  const rates = await listSeaRates(conn, null);
  if (!rates.length) {
    await conn.query(
      `DELETE FROM linescout_white_label_landed_costs WHERE product_id = ?`,
      [productId]
    );
    return;
  }

  for (const rate of rates) {
    const [countryRows]: any = await conn.query(
      `
      SELECT c.id, cur.code AS currency_code
      FROM linescout_countries c
      LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [rate.country_id]
    );
    const country = countryRows?.[0];
    if (!country?.id) continue;
    const currencyCode = String(country.currency_code || "USD").toUpperCase();
    await upsertLandedRows(conn, rate.country_id, currencyCode, rate, [product]);
  }
}
