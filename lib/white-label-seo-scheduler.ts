import { db } from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

type GscSignal = {
  pageUrl: string;
  slug: string;
  clicks: number;
  impressions: number;
  position: number;
  queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
};

type ProductCandidate = RowDataPacket & {
  id: number;
  product_name: string;
  slug: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  view_count: number;
  has_published_content: number;
  published_revision_id: number | null;
};

type ActiveBatchRow = RowDataPacket & {
  id: number;
  batch_key: string;
  item_count: number;
  open_items: number;
};

type DailyBatchRow = RowDataPacket & {
  id: number;
  batch_key: string;
  target_size: number;
};

type WeeklyBatchRow = RowDataPacket & { scheduled_items: number };

function inferSearchIntent(queries: string[]) {
  const text = queries.join(" ").toLowerCase();
  if (/\b(buy|price|cost|quote|order)\b/.test(text)) return "transactional";
  if (/\b(wholesale|supplier|manufacturer|private label|custom logo|import|source|moq)\b/.test(text)) {
    return "commercial_investigation";
  }
  if (/\b(how|what|which|guide|best)\b/.test(text)) return "informational";
  return "commercial_investigation";
}

function slugFromPageUrl(pageUrl: string) {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const index = parts.indexOf("white-label");
    return index >= 0 ? String(parts[index + 1] || "") : "";
  } catch {
    return "";
  }
}

async function fetchGscSignals(): Promise<Map<string, GscSignal>> {
  const origin = String(process.env.SUREIMPORTS_SEO_API_ORIGIN || "").replace(/\/$/, "");
  const secret = process.env.SEO_INTERNAL_API_SECRET || process.env.CRON_SECRET;
  if (!origin || !secret) return new Map();
  try {
    const response = await fetch(`${origin}/api/internal/seo/linescout-products?days=120&limit=1500`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return new Map();
    const body = await response.json().catch(() => null);
    const signals = new Map<string, GscSignal>();
    for (const row of Array.isArray(body?.products) ? body.products : []) {
      const slug = String(row.slug || slugFromPageUrl(row.pageUrl || ""));
      if (slug) signals.set(slug, { ...row, slug });
    }
    return signals;
  } catch (error) {
    console.warn("White-label SEO scheduler could not load GSC signals", error);
    return new Map();
  }
}

function priorityFor(product: ProductCandidate, signal: GscSignal | undefined) {
  const impressions = Number(signal?.impressions || 0);
  const clicks = Number(signal?.clicks || 0);
  const position = Number(signal?.position || 0);
  const strikingDistance = position >= 5 && position <= 20 ? 80 : 0;
  return Number(product.view_count || 0) * 10 + impressions * 0.15 + clicks * 6 + strikingDistance;
}

function batchKey(now: Date) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `wl-seo-${date}-${now.getUTCHours().toString().padStart(2, "0")}${now
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function utcWeekWindow(now: Date) {
  const start = new Date(now);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function utcDayWindow(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function scheduleNextWhiteLabelSeoBatch(options?: { targetSize?: number; now?: Date }) {
  const requestedSize = Math.max(1, Math.min(5, Number(options?.targetSize || 5)));
  const now = options?.now || new Date();
  const week = utcWeekWindow(now);
  const day = utcDayWindow(now);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [activeRows] = await conn.query<ActiveBatchRow[]>(
      `SELECT b.id, b.batch_key, b.status, COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.status NOT IN ('published', 'archived', 'skipped') THEN 1 ELSE 0 END) AS open_items
       FROM linescout_white_label_seo_batches b
       LEFT JOIN linescout_white_label_seo_batch_items i ON i.batch_id = b.id
       WHERE b.status IN ('scheduled', 'drafting', 'review')
       GROUP BY b.id
       ORDER BY b.id ASC
       LIMIT 1
       FOR UPDATE`,
    );
    const active = activeRows?.[0];
    if (active && Number(active.open_items || 0) > 0) {
      await conn.commit();
      return { created: false, batchId: Number(active.id), batchKey: String(active.batch_key), itemCount: Number(active.item_count) };
    }
    if (active) {
      await conn.query(
        `UPDATE linescout_white_label_seo_batches
         SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
         WHERE id = ?`,
        [Number(active.id)],
      );
    }
    const [dailyRows] = await conn.query<DailyBatchRow[]>(
      `SELECT id, batch_key, target_size
       FROM linescout_white_label_seo_batches
       WHERE created_at >= ? AND created_at < ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [day.start, day.end],
    );
    const dailyBatch = dailyRows?.[0];
    if (dailyBatch) {
      await conn.commit();
      return {
        created: false,
        reason: "daily_limit",
        batchId: Number(dailyBatch.id),
        batchKey: String(dailyBatch.batch_key),
        itemCount: Number(dailyBatch.target_size || 0),
        nextEligibleAt: day.end.toISOString(),
      };
    }

    const [weeklyRows] = await conn.query<WeeklyBatchRow[]>(
      `SELECT COALESCE(SUM(target_size), 0) AS scheduled_items
       FROM linescout_white_label_seo_batches
       WHERE created_at >= ? AND created_at < ?`,
      [week.start, week.end],
    );
    const scheduledThisWeek = Number(weeklyRows?.[0]?.scheduled_items || 0);
    const remainingThisWeek = Math.max(0, 35 - scheduledThisWeek);
    if (remainingThisWeek === 0) {
      await conn.commit();
      return {
        created: false,
        reason: "weekly_limit",
        batchId: null,
        batchKey: null,
        itemCount: 0,
        scheduledThisWeek,
        nextEligibleAt: week.end.toISOString(),
      };
    }
    const targetSize = Math.min(requestedSize, remainingThisWeek);

    const [candidateRows] = await conn.query<ProductCandidate[]>(
      `SELECT p.id, p.product_name, p.slug, p.category, p.short_desc, p.why_sells,
              p.regulatory_note, COALESCE(v.views, 0) AS view_count,
              EXISTS(
                SELECT 1 FROM linescout_white_label_seo_revisions r
                WHERE r.product_id = p.id AND r.status = 'published'
              ) AS has_published_content,
              (
                SELECT r.id FROM linescout_white_label_seo_revisions r
                WHERE r.product_id = p.id AND r.status = 'published'
                ORDER BY r.version DESC LIMIT 1
              ) AS published_revision_id
       FROM linescout_white_label_products p
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS views
         FROM linescout_white_label_views
         GROUP BY product_id
       ) v ON v.product_id = p.id
       WHERE p.is_active = 1
         AND p.slug IS NOT NULL
         AND p.slug <> ''
         AND NOT EXISTS (
           SELECT 1
           FROM linescout_white_label_seo_batch_items existing
           WHERE existing.product_id = p.id
             AND existing.status NOT IN ('skipped', 'archived')
         )
       ORDER BY view_count DESC, p.sort_order ASC, p.id ASC
       LIMIT 500`,
    );
    await conn.commit();

    const signals = await fetchGscSignals();
    const candidates = candidateRows || [];
    const selected = candidates
      .map((product) => ({ product, signal: signals.get(String(product.slug)), score: priorityFor(product, signals.get(String(product.slug))) }))
      .sort((left, right) => right.score - left.score || Number(left.product.id) - Number(right.product.id))
      .slice(0, targetSize);
    if (!selected.length) return { created: false, batchId: null, batchKey: null, itemCount: 0 };

    await conn.beginTransaction();
    const key = batchKey(now);
    const [batchResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO linescout_white_label_seo_batches
       (batch_key, status, target_size, selection_method, scheduled_for, notes)
       VALUES (?, 'scheduled', ?, 'gsc_then_views', ?, ?)`,
      [key, targetSize, now, "Automatically prioritized; content remains draft-only until validation and editorial review."],
    );
    const batchId = Number(batchResult.insertId);
    for (let index = 0; index < selected.length; index += 1) {
      const { product, signal, score } = selected[index];
      const queries = signal?.queries || [];
      const queryTexts = queries.map((query) => String(query.query || "")).filter(Boolean);
      const status = Number(product.has_published_content) ? "published" : "queued";
      const reason = signal?.impressions
        ? `${signal.impressions} GSC impressions, ${signal.clicks} clicks, ${product.view_count} LineScout views.`
        : `${product.view_count} LineScout views; no product-page GSC signal available yet.`;
      const brief = {
        productName: product.product_name,
        slug: product.slug,
        category: product.category,
        currentDescription: product.short_desc,
        currentDemandRationale: product.why_sells,
        regulatoryNote: product.regulatory_note,
        primaryQuery: queryTexts[0] || null,
        supportingQueries: queryTexts.slice(1, 10),
        searchIntent: inferSearchIntent(queryTexts),
        audience: "Nigeria-first importers, with transferable guidance for buyers in other markets",
        requiredCta: "Start sourcing this exact product through LineScout",
        claimRules: [
          "Do not invent prices, MOQs, certifications, delivery times, customs rates or government requirements.",
          "Mark regulatory and destination-market claims for editorial source review.",
          "Write product-specific guidance rather than substituting the product name into generic copy.",
        ],
      };
      await conn.query(
        `INSERT INTO linescout_white_label_seo_batch_items
         (batch_id, product_id, position, status, priority_score, priority_reason,
          view_count_snapshot, gsc_clicks_snapshot, gsc_impressions_snapshot,
          gsc_position_snapshot, primary_query, supporting_queries_json,
          search_intent, authoring_brief_json, content_revision_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          Number(product.id),
          index + 1,
          status,
          score,
          reason,
          Number(product.view_count || 0),
          Number(signal?.clicks || 0),
          Number(signal?.impressions || 0),
          signal?.position || null,
          queryTexts[0] || null,
          JSON.stringify(queryTexts.slice(1, 10)),
          inferSearchIntent(queryTexts),
          JSON.stringify(brief),
          product.published_revision_id ? Number(product.published_revision_id) : null,
        ],
      );
    }
    await conn.commit();
    return { created: true, batchId, batchKey: key, itemCount: selected.length };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // The connection may not have an active transaction.
    }
    throw error;
  } finally {
    conn.release();
  }
}
