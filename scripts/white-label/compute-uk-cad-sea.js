#!/usr/bin/env node

const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

const RMB_PER_KG_SEA = 20;
const MARKUP = 0.2;
const LANDED_LOW_MULTIPLIER = 0.5;

function toNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function computeSeaCosts({
  volKgPer1000,
  fobLowUsd,
  fobHighUsd,
  rmbPerUsd,
  rmbPerUnitCurrency,
}) {
  const freightPerUnitRmb = (volKgPer1000 * RMB_PER_KG_SEA) / 1000;
  const fobLowRmb = fobLowUsd * rmbPerUsd;
  const fobHighRmb = fobHighUsd * rmbPerUsd;

  const landedLowRmb = (fobLowRmb + freightPerUnitRmb) * (1 + MARKUP) * LANDED_LOW_MULTIPLIER;
  const landedHighRmb = (fobHighRmb + freightPerUnitRmb) * (1 + MARKUP);

  const perUnitLow = landedLowRmb / rmbPerUnitCurrency;
  const perUnitHigh = landedHighRmb / rmbPerUnitCurrency;
  return {
    perUnitLow,
    perUnitHigh,
    totalLow: perUnitLow * 1000,
    totalHigh: perUnitHigh * 1000,
  };
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  async function fetchRate(base, quote) {
    const [rows] = await conn.query(
      `
      SELECT rate
      FROM linescout_fx_rates
      WHERE base_currency_code = ? AND quote_currency_code = ?
      ORDER BY effective_at DESC, id DESC
      LIMIT 1
      `,
      [base, quote]
    );
    return toNumber(rows?.[0]?.rate);
  }

  const rmbToUsd = await fetchRate("RMB", "USD");
  const rmbToGbp = await fetchRate("RMB", "GBP");
  const rmbToCad = await fetchRate("RMB", "CAD");
  if (!rmbToUsd || !rmbToGbp || !rmbToCad) {
    throw new Error("Missing FX rates for RMB→USD, RMB→GBP, or RMB→CAD.");
  }
  const rmbPerUsd = 1 / rmbToUsd;
  const rmbPerGbp = 1 / rmbToGbp;
  const rmbPerCad = 1 / rmbToCad;

  const [rows] = await conn.query(
    `
    SELECT id, volumetric_kg_per_1000, fob_low_usd, fob_high_usd
    FROM linescout_white_label_products
    WHERE volumetric_kg_per_1000 IS NOT NULL
    `
  );

  let updated = 0;
  for (const row of rows) {
    const vol = toNumber(row.volumetric_kg_per_1000);
    const fobLowUsd = toNumber(row.fob_low_usd);
    const fobHighUsd = toNumber(row.fob_high_usd);
    if (!vol || vol <= 0) continue;
    if (fobLowUsd === null || fobHighUsd === null) continue;

    const gbp = computeSeaCosts({
      volKgPer1000: vol,
      fobLowUsd,
      fobHighUsd,
      rmbPerUsd,
      rmbPerUnitCurrency: rmbPerGbp,
    });
    const cad = computeSeaCosts({
      volKgPer1000: vol,
      fobLowUsd,
      fobHighUsd,
      rmbPerUsd,
      rmbPerUnitCurrency: rmbPerCad,
    });
    const usd = computeSeaCosts({
      volKgPer1000: vol,
      fobLowUsd,
      fobHighUsd,
      rmbPerUsd,
      rmbPerUnitCurrency: rmbPerUsd,
    });

    await conn.query(
      `
      UPDATE linescout_white_label_products
      SET
        landed_gbp_sea_per_unit_low = ?,
        landed_gbp_sea_per_unit_high = ?,
        landed_gbp_sea_total_1000_low = ?,
        landed_gbp_sea_total_1000_high = ?,
        landed_cad_sea_per_unit_low = ?,
        landed_cad_sea_per_unit_high = ?,
        landed_cad_sea_total_1000_low = ?,
        landed_cad_sea_total_1000_high = ?,
        landed_usd_sea_per_unit_low = ?,
        landed_usd_sea_per_unit_high = ?,
        landed_usd_sea_total_1000_low = ?,
        landed_usd_sea_total_1000_high = ?
      WHERE id = ?
      `,
      [
        gbp.perUnitLow,
        gbp.perUnitHigh,
        gbp.totalLow,
        gbp.totalHigh,
        cad.perUnitLow,
        cad.perUnitHigh,
        cad.totalLow,
        cad.totalHigh,
        usd.perUnitLow,
        usd.perUnitHigh,
        usd.totalLow,
        usd.totalHigh,
        row.id,
      ]
    );
    updated += 1;
  }

  await conn.end();
  console.log(`Updated ${updated} products with UK/CAD sea landed costs.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
