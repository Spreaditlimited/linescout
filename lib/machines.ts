import type { PoolConnection } from "mysql2/promise";

export type MachineSeed = {
  machine_name: string;
  category: string;
  processing_stage?: string | null;
  capacity_range?: string | null;
  power_requirement?: string | null;
  short_desc?: string | null;
  why_sells?: string | null;
  regulatory_note?: string | null;
  mockup_prompt?: string | null;
  image_url?: string | null;
  slug?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  business_summary?: string | null;
  market_notes?: string | null;
  sourcing_notes?: string | null;
  fob_low_usd?: number | null;
  fob_high_usd?: number | null;
  cbm_per_unit?: number | null;
  sort_order?: number;
  is_active?: 0 | 1;
};

export type MachinePricingSettings = {
  exchange_rate_usd: number;
  markup_percent: number;
  cbm_rate_ngn: number;
  shipping_type_name: string;
};

const DEFAULTS: MachinePricingSettings = {
  exchange_rate_usd: 1500,
  markup_percent: 0.2,
  cbm_rate_ngn: 450000,
  shipping_type_name: "Sea",
};

let didEnsureTable = false;
let didEnsureViews = false;
let didBackfillSlugs = false;

export async function ensureMachinesReady(conn: PoolConnection) {
  if (!didEnsureTable) {
    await ensureMachinesTable(conn);
    didEnsureTable = true;
  }
  if (!didEnsureViews) {
    await ensureMachineViewsTable(conn);
    didEnsureViews = true;
  }
  if (!didBackfillSlugs) {
    await backfillMachineSlugs(conn);
    didBackfillSlugs = true;
  }
}

export async function ensureMachinesTable(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_machines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      machine_name VARCHAR(255) NOT NULL,
      category VARCHAR(255) NOT NULL,
      processing_stage VARCHAR(255) NULL,
      capacity_range VARCHAR(255) NULL,
      power_requirement VARCHAR(255) NULL,
      short_desc TEXT NULL,
      why_sells TEXT NULL,
      regulatory_note TEXT NULL,
      mockup_prompt TEXT NULL,
      image_url VARCHAR(500) NULL,
      slug VARCHAR(255) NULL,
      seo_title VARCHAR(255) NULL,
      seo_description VARCHAR(500) NULL,
      business_summary TEXT NULL,
      market_notes TEXT NULL,
      sourcing_notes TEXT NULL,
      fob_low_usd DECIMAL(12,2) NULL,
      fob_high_usd DECIMAL(12,2) NULL,
      cbm_per_unit DECIMAL(12,4) NULL,
      is_active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await conn
    .query(`ALTER TABLE linescout_machines ADD COLUMN IF NOT EXISTS mockup_prompt TEXT NULL`)
    .catch(() => {});
  await conn.query(`CREATE INDEX IF NOT EXISTS idx_machines_slug ON linescout_machines (slug)`).catch(() => {});
}

export async function ensureMachineViewsTable(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_machine_views (
      id INT AUTO_INCREMENT PRIMARY KEY,
      machine_id INT NOT NULL,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_machine_views_machine (machine_id),
      INDEX idx_machine_views_time (viewed_at)
    )
  `);
}

async function backfillMachineSlugs(conn: PoolConnection) {
  const [rows]: any = await conn.query(
    `
    SELECT id, machine_name
    FROM linescout_machines
    WHERE COALESCE(slug, '') = ''
    LIMIT 5000
    `
  );
  if (!rows?.length) return;

  for (const row of rows) {
    const slug = slugify(String(row.machine_name || ""));
    if (!slug) continue;
    await conn.query(
      `UPDATE linescout_machines SET slug = ? WHERE id = ?`,
      [slug, row.id]
    );
  }
}

export async function getMachinePricingSettings(conn: PoolConnection): Promise<MachinePricingSettings> {
  let exchange_rate_usd = DEFAULTS.exchange_rate_usd;
  let markup_percent = DEFAULTS.markup_percent;

  const [settingsRows]: any = await conn.query(
    `SELECT exchange_rate_usd, markup_percent FROM linescout_settings ORDER BY id DESC LIMIT 1`
  );
  if (settingsRows?.length) {
    const row = settingsRows[0];
    const usd = Number(row.exchange_rate_usd || 0);
    const markup = Number(row.markup_percent || 0);
    if (Number.isFinite(usd) && usd > 0) exchange_rate_usd = usd;
    if (Number.isFinite(markup) && markup >= 0) markup_percent = markup;
  }

  let cbm_rate_ngn = DEFAULTS.cbm_rate_ngn;
  let shipping_type_name = DEFAULTS.shipping_type_name;
  const [rateRows]: any = await conn.query(
    `
    SELECT r.rate_value, r.rate_unit, r.currency, t.name AS shipping_type_name
    FROM linescout_shipping_rates r
    JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
    WHERE r.is_active = 1
      AND r.rate_unit = 'per_cbm'
      AND LOWER(t.name) LIKE '%sea%'
    ORDER BY r.id DESC
    LIMIT 1
    `
  );
  if (rateRows?.length) {
    const r = rateRows[0];
    shipping_type_name = String(r.shipping_type_name || DEFAULTS.shipping_type_name);
    const rateValue = Number(r.rate_value || 0);
    const currency = String(r.currency || "NGN").toUpperCase();
    if (Number.isFinite(rateValue) && rateValue > 0) {
      cbm_rate_ngn = currency === "USD" ? rateValue * exchange_rate_usd : rateValue;
    }
  }

  return { exchange_rate_usd, markup_percent, cbm_rate_ngn, shipping_type_name };
}

export function computeMachineLandedRange(input: {
  fob_low_usd?: number | null;
  fob_high_usd?: number | null;
  cbm_per_unit?: number | null;
  exchange_rate_usd?: number;
  cbm_rate_ngn?: number;
  markup_percent?: number;
}) {
  const fobLow = toNumber(input.fob_low_usd);
  const fobHigh = toNumber(input.fob_high_usd);
  const cbm = toNumber(input.cbm_per_unit);
  const fx = toNumber(input.exchange_rate_usd ?? DEFAULTS.exchange_rate_usd) ?? DEFAULTS.exchange_rate_usd;
  const cbmRate = toNumber(input.cbm_rate_ngn ?? DEFAULTS.cbm_rate_ngn) ?? DEFAULTS.cbm_rate_ngn;
  const markup = toNumber(input.markup_percent ?? DEFAULTS.markup_percent) ?? DEFAULTS.markup_percent;

  if (fobLow === null || fobHigh === null || cbm === null) {
    return {
      landed_ngn_low: null,
      landed_ngn_high: null,
      freight_ngn: null,
    };
  }

  const freight = cbm * cbmRate;
  const landedLow = (fobLow * fx + freight) * (1 + markup);
  const landedHigh = (fobHigh * fx + freight) * (1 + markup);

  return {
    landed_ngn_low: Number(landedLow.toFixed(2)),
    landed_ngn_high: Number(landedHigh.toFixed(2)),
    freight_ngn: Number(freight.toFixed(2)),
  };
}

export function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toNumber(value: any): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}
