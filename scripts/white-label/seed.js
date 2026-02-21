#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const args = parseArgs(process.argv.slice(2));
const JSON_PATH = args.file || path.join(process.cwd(), "data", "white-label-products.json");
const DRY_RUN = Boolean(args.dryRun);
const APPEND = Boolean(args.append);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`Missing JSON file: ${JSON_PATH}`);
  }
  const raw = fs.readFileSync(JSON_PATH, "utf8").trim();
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || !items.length) {
    throw new Error("JSON must be a non-empty array");
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS linescout_white_label_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL,
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
        white_label_angle TEXT NULL,
        fob_low_usd DECIMAL(10,2) NULL,
        fob_high_usd DECIMAL(10,2) NULL,
        cbm_per_1000 DECIMAL(10,4) NULL,
        size_template VARCHAR(32) NULL,
        volumetric_kg_per_1000 DECIMAL(10,2) NULL,
        landed_gbp_sea_per_unit_low DECIMAL(10,4) NULL,
        landed_gbp_sea_per_unit_high DECIMAL(10,4) NULL,
        landed_gbp_sea_total_1000_low DECIMAL(12,2) NULL,
        landed_gbp_sea_total_1000_high DECIMAL(12,2) NULL,
        landed_cad_sea_per_unit_low DECIMAL(10,4) NULL,
        landed_cad_sea_per_unit_high DECIMAL(10,4) NULL,
        landed_cad_sea_total_1000_low DECIMAL(12,2) NULL,
        landed_cad_sea_total_1000_high DECIMAL(12,2) NULL,
        is_active TINYINT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    if (DRY_RUN && !APPEND) {
      console.log(`DRY RUN: would overwrite linescout_white_label_products with ${items.length} rows.`);
      return;
    }

    let existingKey = new Set();
    let existingCount = 0;
    let maxSort = 0;
    if (APPEND) {
      const [rows] = await conn.query(
        `SELECT product_name, category, sort_order FROM linescout_white_label_products`
      );
      existingCount = rows?.length || 0;
      for (const r of rows || []) {
        const key = `${String(r.product_name || "").toLowerCase()}||${String(r.category || "").toLowerCase()}`;
        existingKey.add(key);
        const s = Number(r.sort_order || 0);
        if (Number.isFinite(s) && s > maxSort) maxSort = s;
      }
    }

    const filtered = APPEND
      ? items.filter((p) => {
          const key = `${String(p.product_name || "").toLowerCase()}||${String(p.category || "").toLowerCase()}`;
          return !existingKey.has(key);
        })
      : items;

    if (DRY_RUN && APPEND) {
      console.log(`DRY RUN: would insert ${filtered.length} rows.`);
      console.log(`Already exists ${existingCount} rows.`);
      return;
    }

    await conn.beginTransaction();
    if (!APPEND) {
      await conn.query("TRUNCATE TABLE linescout_white_label_products");
    }

    const chunkSize = 200;
    for (let i = 0; i < filtered.length; i += chunkSize) {
      const chunk = filtered.slice(i, i + chunkSize);
      const values = chunk.map((p, idx) => [
        p.product_name,
        p.category,
        p.short_desc || null,
        p.why_sells || null,
        p.regulatory_note || null,
        p.mockup_prompt || null,
        p.image_url || null,
        p.slug || slugify(p.product_name),
        p.seo_title || null,
        p.seo_description || null,
        p.business_summary || null,
        p.market_notes || null,
        p.white_label_angle || null,
        p.fob_low_usd ?? null,
        p.fob_high_usd ?? null,
        p.cbm_per_1000 ?? null,
        p.size_template ?? null,
        p.volumetric_kg_per_1000 ?? null,
        1,
        p.sort_order ?? maxSort + i + idx + 1,
      ]);

      await conn.query(
        `
        INSERT INTO linescout_white_label_products
          (product_name, category, short_desc, why_sells, regulatory_note, mockup_prompt, image_url,
           slug, seo_title, seo_description, business_summary, market_notes, white_label_angle,
           fob_low_usd, fob_high_usd, cbm_per_1000, size_template, volumetric_kg_per_1000, is_active, sort_order)
        VALUES ?
        `,
        [values]
      );
    }

    await conn.commit();
    console.log(`Seeded ${filtered.length} products.`);
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    throw e;
  } finally {
    await conn.end();
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
