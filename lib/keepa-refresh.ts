import type { PoolConnection } from "mysql2/promise";
import { fetchKeepaPrice, keepaMarketplaces, searchKeepaAsin } from "@/lib/keepa";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";

type KeepaProductRow = {
  id: number;
  product_name: string;
  category: string;
  amazon_uk_asin?: string | null;
  amazon_ca_asin?: string | null;
};

type RefreshResult = {
  updated: number;
  skipped: number;
  errors: number;
  lastError?: string | null;
};

type RefreshOptions = {
  marketplaces?: ("UK" | "CA")[];
  maxProducts?: number;
  force?: boolean;
};

function buildSearchTerm(row: KeepaProductRow) {
  const name = String(row.product_name || "").trim();
  const category = String(row.category || "").trim();
  if (!category) return name;
  return `${name} ${category}`;
}

function nextAsin(row: KeepaProductRow, market: "UK" | "CA") {
  return market === "UK" ? row.amazon_uk_asin : row.amazon_ca_asin;
}

function marketColumns(market: "UK" | "CA") {
  if (market === "UK") {
    return {
      asin: "amazon_uk_asin",
      url: "amazon_uk_url",
      currency: "amazon_uk_currency",
      priceLow: "amazon_uk_price_low",
      priceHigh: "amazon_uk_price_high",
      checkedAt: "amazon_uk_last_checked_at",
    } as const;
  }
  return {
    asin: "amazon_ca_asin",
    url: "amazon_ca_url",
    currency: "amazon_ca_currency",
    priceLow: "amazon_ca_price_low",
    priceHigh: "amazon_ca_price_high",
    checkedAt: "amazon_ca_last_checked_at",
  } as const;
}

export async function refreshKeepaProducts(
  conn: PoolConnection,
  rows: KeepaProductRow[],
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  await ensureWhiteLabelProductsReady(conn);
  const marketplaces = options.marketplaces?.length ? options.marketplaces : keepaMarketplaces();
  const maxProducts =
    options.maxProducts && options.maxProducts > 0 ? options.maxProducts : rows.length;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let lastError: string | null = null;

  for (const row of rows.slice(0, maxProducts)) {
    for (const market of marketplaces) {
      const cols = marketColumns(market);
      let asin = nextAsin(row, market);
      try {
        if (!asin) {
          const term = buildSearchTerm(row);
          asin = await searchKeepaAsin(term, market);
        }

        if (!asin) {
          await conn.query(
            `UPDATE linescout_white_label_products SET ${cols.checkedAt} = NOW() WHERE id = ? LIMIT 1`,
            [row.id]
          );
          skipped += 1;
          continue;
        }

        const price = await fetchKeepaPrice(asin, market);
        if (!price) {
          await conn.query(
            `UPDATE linescout_white_label_products SET ${cols.asin} = ?, ${cols.checkedAt} = NOW() WHERE id = ? LIMIT 1`,
            [asin, row.id]
          );
          skipped += 1;
          continue;
        }

        await conn.query(
          `
          UPDATE linescout_white_label_products
          SET ${cols.asin} = ?,
              ${cols.url} = ?,
              ${cols.currency} = ?,
              ${cols.priceLow} = ?,
              ${cols.priceHigh} = ?,
              ${cols.checkedAt} = NOW()
          WHERE id = ?
          LIMIT 1
          `,
          [
            price.asin,
            price.url,
            price.currency,
            price.price_low,
            price.price_high,
            row.id,
          ]
        );
        updated += 1;
      } catch (e: any) {
        errors += 1;
        if (!lastError) {
          lastError = String(e?.message || e || "Keepa request failed");
        }
      }
    }
  }

  return { updated, skipped, errors, lastError };
}

export async function listTopWhiteLabelProducts(
  conn: PoolConnection,
  limit: number,
  offset = 0
) {
  await ensureWhiteLabelProductsReady(conn);
  const safeLimit = Math.max(1, Math.min(limit, 2000));
  const safeOffset = Math.max(0, offset);
  const [rows]: any = await conn.query(
    `
    SELECT p.id, p.product_name, p.category, p.amazon_uk_asin, p.amazon_ca_asin
    FROM linescout_white_label_products p
    LEFT JOIN (
      SELECT product_id, COUNT(*) AS views
      FROM linescout_white_label_views
      GROUP BY product_id
    ) v ON v.product_id = p.id
    WHERE p.is_active = 1
    ORDER BY COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
    `
  );

  return rows as KeepaProductRow[];
}
