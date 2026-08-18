require("./register-ts.cjs");

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { validateWhiteLabelSeoContent } = require("../../lib/white-label-seo-types.ts");

function checksum(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function run() {
  const slugArg = process.argv.find((item) => item.startsWith("--slug="));
  const onlySlug = String(slugArg?.split("=")[1] || "").trim();
  const draftsDirectory = path.join(__dirname, "../../data/white-label-seo-drafts");
  const files = fs
    .readdirSync(draftsDirectory)
    .filter((file) => file.endsWith(".json") && (!onlySlug || file === `${onlySlug}.json`))
    .sort();
  if (!files.length) throw new Error(onlySlug ? `No draft file found for ${onlySlug}.` : "No SEO draft files found.");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? {} : undefined,
  });
  const results = [];
  try {
    for (const file of files) {
      const slug = file.replace(/\.json$/, "");
      const content = JSON.parse(fs.readFileSync(path.join(draftsDirectory, file), "utf8"));
      const validation = validateWhiteLabelSeoContent(content);
      if (!validation.valid) throw new Error(`${slug}: ${validation.errors.join(" ")}`);
      const digest = checksum(content);
      const [items] = await connection.query(
        `SELECT i.id AS item_id, i.batch_id, i.product_id, i.primary_query,
                i.supporting_queries_json, i.search_intent
         FROM linescout_white_label_seo_batch_items i
         JOIN linescout_white_label_products p ON p.id = i.product_id
         WHERE p.slug = ? AND i.status IN ('queued', 'drafting', 'review')
         ORDER BY i.batch_id ASC LIMIT 1`,
        [slug],
      );
      const item = items?.[0];
      if (!item?.product_id) throw new Error(`${slug}: no open batch item found.`);
      const [existing] = await connection.query(
        `SELECT id, version FROM linescout_white_label_seo_revisions
         WHERE product_id = ? AND source_content_checksum = ? LIMIT 1`,
        [Number(item.product_id), digest],
      );
      if (existing.length) {
        results.push({ slug, revisionId: Number(existing[0].id), version: Number(existing[0].version), unchanged: true });
        continue;
      }

      await connection.beginTransaction();
      const [versionRows] = await connection.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM linescout_white_label_seo_revisions WHERE product_id = ? FOR UPDATE`,
        [Number(item.product_id)],
      );
      const version = Number(versionRows?.[0]?.next_version || 1);
      const supportingQueries =
        typeof item.supporting_queries_json === "string"
          ? JSON.parse(item.supporting_queries_json || "[]")
          : item.supporting_queries_json || [];
      const sourceQueries = [item.primary_query, ...supportingQueries].filter(Boolean);
      const [result] = await connection.query(
        `INSERT INTO linescout_white_label_seo_revisions
         (product_id, slug, version, status, content_json, primary_keyword,
          supporting_keywords_json, search_intent, source_queries_json,
          source_content_checksum, quality_score, validation_json, batch_id, created_by)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Codex scheduled batch')`,
        [
          Number(item.product_id),
          slug,
          version,
          JSON.stringify(content),
          content.keywords[0],
          JSON.stringify(content.keywords.slice(1)),
          item.search_intent || "commercial_investigation",
          JSON.stringify(sourceQueries),
          digest,
          validation.score,
          JSON.stringify(validation),
          Number(item.batch_id),
        ],
      );
      const revisionId = Number(result.insertId);
      await connection.query(
        `UPDATE linescout_white_label_seo_batch_items
         SET status = 'review', content_revision_id = ?, validation_json = ?
         WHERE id = ?`,
        [revisionId, JSON.stringify(validation), Number(item.item_id)],
      );
      await connection.query(
        `UPDATE linescout_white_label_seo_batches SET status = 'review', started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
        [Number(item.batch_id)],
      );
      await connection.commit();
      results.push({ slug, revisionId, version, qualityScore: validation.score, warnings: validation.warnings });
    }
    console.log(JSON.stringify({ ok: true, drafts: results }, null, 2));
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    throw error;
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

