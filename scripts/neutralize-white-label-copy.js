#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

const argv = process.argv.slice(2);
const outArg = argv.find((a) => a.startsWith("--out="));
const limitArg = argv.find((a) => a.startsWith("--limit="));
const apply = argv.includes("--apply");
const outPath = outArg ? outArg.split("=")[1] : path.join(process.cwd(), "white_label_neutralized.csv");
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const FIELDS = [
  "seo_title",
  "seo_description",
  "short_desc",
  "why_sells",
  "regulatory_note",
  "business_summary",
  "market_notes",
  "white_label_angle",
];

function applyRewrites(input) {
  if (!input) return input;
  let s = input;

  const replacements = [
    [new RegExp("\\bNigerian consumers\\b", "gi"), "consumers"],
    [new RegExp("\\bNigerian buyers\\b", "gi"), "buyers"],
    [new RegExp("\\bNigerian parents\\b", "gi"), "parents"],
    [new RegExp("\\bNigerian families\\b", "gi"), "families"],
    [new RegExp("\\bNigerian drivers\\b", "gi"), "drivers"],
    [new RegExp("\\bNigerian motorists\\b", "gi"), "motorists"],
    [new RegExp("\\bNigerian households\\b", "gi"), "households"],
    [new RegExp("\\bNigerian homes\\b", "gi"), "homes"],
    [new RegExp("\\bNigerian offices\\b", "gi"), "offices"],
    [new RegExp("\\bNigerian women\\b", "gi"), "women"],
    [new RegExp("\\bNigerian men\\b", "gi"), "men"],
    [new RegExp("\\bNigerian skincare routines\\b", "gi"), "skincare routines"],
    [new RegExp("\\bNigerian beauty routines\\b", "gi"), "beauty routines"],
    [new RegExp("\\bNigerian fitness programs\\b", "gi"), "fitness programs"],
    [new RegExp("\\bNigerian pet owners\\b", "gi"), "pet owners"],
    [new RegExp("\\bNigeria’s climate\\b", "gi"), "hot climates"],
    [new RegExp("\\bNigeria's climate\\b", "gi"), "hot climates"],
    [new RegExp("\\bNigeria’s hot climate\\b", "gi"), "hot climates"],
    [new RegExp("\\bNigeria's hot climate\\b", "gi"), "hot climates"],
    [new RegExp("\\bNigeria’s\\b", "g"), "the market's"],
    [new RegExp("\\bNigeria's\\b", "g"), "the market's"],
    [new RegExp("\\bNigerians\\b", "gi"), "consumers"],
    [new RegExp("\\bNigerian\\b", "gi"), ""],
    [new RegExp("\\bin Nigeria\\b", "gi"), ""],
    [new RegExp("\\bto Nigeria\\b", "gi"), ""],
    [new RegExp("\\bfrom Nigeria\\b", "gi"), ""],
    [new RegExp("\\bNigeria\\b", "g"), "the market"],
  ];

  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  s = s.replace(/\(\s+/g, "(");
  s = s.replace(/\s+\)/g, ")");
  s = s.replace(/^\s+|\s+$/g, "");

  // Normalize sentence starts if they became lowercase after removal
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (m, p1, p2) => `${p1}${p2.toUpperCase()}`);

  return s;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const likeNigeria = "%Nigeria%";
  const likeNigerian = "%Nigerian%";
  const sql = `
    SELECT id, product_name, seo_title, seo_description, short_desc, why_sells, regulatory_note, business_summary, market_notes, white_label_angle
    FROM linescout_white_label_products
    WHERE seo_title LIKE ? OR seo_title LIKE ?
       OR seo_description LIKE ? OR seo_description LIKE ?
       OR short_desc LIKE ? OR short_desc LIKE ?
       OR why_sells LIKE ? OR why_sells LIKE ?
       OR regulatory_note LIKE ? OR regulatory_note LIKE ?
       OR business_summary LIKE ? OR business_summary LIKE ?
       OR market_notes LIKE ? OR market_notes LIKE ?
       OR white_label_angle LIKE ? OR white_label_angle LIKE ?
    ORDER BY id ASC
  `;

  const [rows] = await conn.query(sql, [
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
    likeNigeria, likeNigerian,
  ]);

  const output = [
    ["id", "product_name", "field", "current", "proposed"].join(","),
  ];

  let count = 0;
  let updated = 0;
  const updateSql = `UPDATE linescout_white_label_products SET ?? = ? WHERE id = ?`;
  for (const row of rows) {
    for (const field of FIELDS) {
      const current = row[field];
      if (typeof current !== "string") continue;
      if (!current.includes("Nigeria") && !current.includes("Nigerian")) continue;
      const proposed = applyRewrites(current);
      output.push(
        [
          csvEscape(row.id),
          csvEscape(row.product_name),
          csvEscape(field),
          csvEscape(current),
          csvEscape(proposed),
        ].join(",")
      );
      if (apply && proposed && proposed !== current) {
        await conn.query(updateSql, [field, proposed, row.id]);
        updated += 1;
      }
      count += 1;
      if (limit && count >= limit) break;
    }
    if (limit && count >= limit) break;
  }

  fs.writeFileSync(outPath, output.join("\n"), "utf8");
  await conn.end();

  console.log(`Wrote ${count} rows to ${outPath}`);
  if (apply) {
    console.log(`Applied ${updated} updates to linescout_white_label_products`);
  }
})();
