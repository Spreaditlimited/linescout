require("./register-ts.cjs");

const mysql = require("mysql2/promise");
const { validateWhiteLabelSeoContent } = require("../../lib/white-label-seo-types.ts");

async function run() {
  const slugArg = process.argv.find((item) => item.startsWith("--slug="));
  const slug = String(slugArg?.split("=")[1] || "").trim();
  if (!slug || !process.argv.includes("--confirm")) {
    throw new Error("Usage: node .../publish.cjs --slug=product-slug --confirm");
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? {} : undefined,
  });
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, product_id, batch_id, content_json
       FROM linescout_white_label_seo_revisions
       WHERE slug = ? AND status IN ('draft', 'review_ready')
       ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [slug],
    );
    const revision = rows?.[0];
    if (!revision?.id) throw new Error(`No draft revision found for ${slug}.`);
    const validation = validateWhiteLabelSeoContent(revision.content_json);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const content =
      typeof revision.content_json === "string"
        ? JSON.parse(revision.content_json)
        : revision.content_json;
    const relatedSlugs = Array.isArray(content.relatedSlugs) ? content.relatedSlugs : [];
    if (relatedSlugs.length) {
      const placeholders = relatedSlugs.map(() => "?").join(", ");
      const [relatedRows] = await connection.query(
        `SELECT slug FROM linescout_white_label_products
         WHERE is_active = 1 AND slug IN (${placeholders})`,
        relatedSlugs,
      );
      const found = new Set(relatedRows.map((row) => String(row.slug)));
      const missing = relatedSlugs.filter((relatedSlug) => !found.has(relatedSlug));
      if (missing.length) throw new Error(`Related product routes do not exist: ${missing.join(", ")}`);
    }
    const [duplicateRows] = await connection.query(
      `SELECT slug
       FROM linescout_white_label_seo_revisions
       WHERE product_id <> ? AND status = 'published'
         AND (
           JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.seoTitle')) = ?
           OR JSON_UNQUOTE(JSON_EXTRACT(content_json, '$.seoDescription')) = ?
         )
       LIMIT 1`,
      [Number(revision.product_id), content.seoTitle, content.seoDescription],
    );
    if (duplicateRows.length) {
      throw new Error(`SEO title or description duplicates published content for ${duplicateRows[0].slug}.`);
    }

    await connection.query(
      `UPDATE linescout_white_label_seo_revisions
       SET status = 'archived', archived_at = NOW()
       WHERE product_id = ? AND id <> ?
         AND status IN ('published', 'draft', 'review_ready')`,
      [Number(revision.product_id), Number(revision.id)],
    );
    await connection.query(
      `UPDATE linescout_white_label_seo_revisions
       SET status = 'published', quality_score = ?, validation_json = ?,
           reviewed_by = 'confirmed-cli-publish', reviewed_at = NOW(), published_at = NOW()
       WHERE id = ?`,
      [validation.score, JSON.stringify(validation), Number(revision.id)],
    );
    await connection.query(
      `UPDATE linescout_white_label_seo_batch_items
       SET status = 'published', content_revision_id = ?, validation_json = ?
       WHERE product_id = ? AND batch_id = ?`,
      [Number(revision.id), JSON.stringify(validation), Number(revision.product_id), Number(revision.batch_id || 0)],
    );
    await connection.commit();
    console.log(JSON.stringify({ ok: true, slug, revisionId: Number(revision.id), qualityScore: validation.score }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
