import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  parseWhiteLabelSeoContent,
  validateWhiteLabelSeoContent,
  type WhiteLabelSeoContent,
  type WhiteLabelSeoValidation,
} from "@/lib/white-label-seo-types";

export type PublishedWhiteLabelSeoRevision = {
  id: number;
  productId: number;
  slug: string;
  version: number;
  content: WhiteLabelSeoContent;
  qualityScore: number;
  publishedAt: string | Date | null;
  updatedAt: string | Date | null;
};

export function contentChecksum(content: WhiteLabelSeoContent) {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function publishedSeoSelect(productAlias = "p") {
  return `(
    SELECT revision.content_json
    FROM linescout_white_label_seo_revisions revision
    WHERE revision.product_id = ${productAlias}.id
      AND revision.status = 'published'
    ORDER BY revision.version DESC
    LIMIT 1
  ) AS seo_content_json`;
}

export function publishedSeoUpdatedAtSelect(productAlias = "p") {
  return `(
    SELECT revision.updated_at
    FROM linescout_white_label_seo_revisions revision
    WHERE revision.product_id = ${productAlias}.id
      AND revision.status = 'published'
    ORDER BY revision.version DESC
    LIMIT 1
  ) AS seo_content_updated_at`;
}

export async function getPublishedWhiteLabelSeoRevision(
  productId: number,
  connection?: PoolConnection,
): Promise<PublishedWhiteLabelSeoRevision | null> {
  const ownsConnection = !connection;
  const conn = connection || (await db.getConnection());
  try {
    const [rows]: any = await conn.query(
      `SELECT id, product_id, slug, version, content_json, quality_score, published_at, updated_at
       FROM linescout_white_label_seo_revisions
       WHERE product_id = ? AND status = 'published'
       ORDER BY version DESC
       LIMIT 1`,
      [productId],
    );
    const row = rows?.[0];
    const content = parseWhiteLabelSeoContent(row?.content_json);
    if (!row?.id || !content) return null;
    return {
      id: Number(row.id),
      productId: Number(row.product_id),
      slug: String(row.slug),
      version: Number(row.version),
      content,
      qualityScore: Number(row.quality_score || 0),
      publishedAt: row.published_at || null,
      updatedAt: row.updated_at || null,
    };
  } finally {
    if (ownsConnection) conn.release();
  }
}

export async function saveWhiteLabelSeoDraft(input: {
  productId: number;
  slug: string;
  content: WhiteLabelSeoContent;
  primaryKeyword?: string | null;
  supportingKeywords?: string[];
  searchIntent?: string | null;
  sourceQueries?: unknown[];
  batchId?: number | null;
  createdBy?: string | null;
}): Promise<{ revisionId: number; version: number; validation: WhiteLabelSeoValidation }> {
  const validation = validateWhiteLabelSeoContent(input.content);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [versionRows]: any = await conn.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM linescout_white_label_seo_revisions
       WHERE product_id = ?
       FOR UPDATE`,
      [input.productId],
    );
    const version = Number(versionRows?.[0]?.next_version || 1);
    const [result]: any = await conn.query(
      `INSERT INTO linescout_white_label_seo_revisions
       (product_id, slug, version, status, content_json, primary_keyword,
        supporting_keywords_json, search_intent, source_queries_json,
        source_content_checksum, quality_score, validation_json, batch_id, created_by)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.productId,
        input.slug,
        version,
        JSON.stringify(input.content),
        input.primaryKeyword || input.content.keywords[0] || null,
        JSON.stringify(input.supportingKeywords || input.content.keywords.slice(1)),
        input.searchIntent || "commercial_investigation",
        JSON.stringify(input.sourceQueries || []),
        contentChecksum(input.content),
        validation.score,
        JSON.stringify(validation),
        input.batchId || null,
        input.createdBy || "seo-pipeline",
      ],
    );
    await conn.commit();
    return { revisionId: Number(result.insertId), version, validation };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
