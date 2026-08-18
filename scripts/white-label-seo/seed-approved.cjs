require("./register-ts.cjs");

const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
const { WHITE_LABEL_SEO_CONTENT } = require("../../data/white-label-seo-content.ts");
const { validateWhiteLabelSeoContent } = require("../../lib/white-label-seo-types.ts");

function checksum(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? {} : undefined,
  });
  let inserted = 0;
  let unchanged = 0;
  try {
    for (const [slug, content] of Object.entries(WHITE_LABEL_SEO_CONTENT)) {
      const validation = validateWhiteLabelSeoContent(content);
      if (!validation.valid) throw new Error(`${slug}: ${validation.errors.join(" ")}`);
      const [products] = await connection.query(
        `SELECT id FROM linescout_white_label_products WHERE slug = ? AND is_active = 1 LIMIT 1`,
        [slug],
      );
      const productId = Number(products?.[0]?.id || 0);
      if (!productId) throw new Error(`No active product found for ${slug}.`);
      const digest = checksum(content);
      const [existing] = await connection.query(
        `SELECT id FROM linescout_white_label_seo_revisions
         WHERE product_id = ? AND status = 'published' AND source_content_checksum = ?
         LIMIT 1`,
        [productId, digest],
      );
      if (existing.length) {
        unchanged += 1;
        continue;
      }

      await connection.beginTransaction();
      const [versionRows] = await connection.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM linescout_white_label_seo_revisions WHERE product_id = ? FOR UPDATE`,
        [productId],
      );
      const version = Number(versionRows?.[0]?.next_version || 1);
      await connection.query(
        `UPDATE linescout_white_label_seo_revisions
         SET status = 'archived', archived_at = NOW()
         WHERE product_id = ? AND status = 'published'`,
        [productId],
      );
      await connection.query(
        `INSERT INTO linescout_white_label_seo_revisions
         (product_id, slug, version, status, content_json, primary_keyword,
          supporting_keywords_json, search_intent, source_queries_json,
          source_content_checksum, quality_score, validation_json, created_by,
          reviewed_by, reviewed_at, published_at)
         VALUES (?, ?, ?, 'published', ?, ?, ?, 'commercial_investigation',
                 JSON_ARRAY(), ?, ?, ?, 'initial-five-code-import', 'Codex editorial pass', NOW(), NOW())`,
        [
          productId,
          slug,
          version,
          JSON.stringify(content),
          content.keywords[0],
          JSON.stringify(content.keywords.slice(1)),
          digest,
          validation.score,
          JSON.stringify(validation),
        ],
      );
      await connection.commit();
      inserted += 1;
    }
    console.log(JSON.stringify({ ok: true, inserted, unchanged, approved: Object.keys(WHITE_LABEL_SEO_CONTENT).length }));
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

