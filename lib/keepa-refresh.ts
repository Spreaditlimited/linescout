import type { PoolConnection } from "mysql2/promise";
import { fetchKeepaPrice, keepaMarketplaces, searchKeepaAsin } from "@/lib/keepa";
import { ensureWhiteLabelProductsReady } from "@/lib/white-label-products";

type KeepaProductRow = {
  id: number;
  product_name: string;
  category: string;
  amazon_uk_asin?: string | null;
  amazon_ca_asin?: string | null;
  amazon_us_asin?: string | null;
};

type RefreshResult = {
  updated: number;
  skipped: number;
  errors: number;
  lastError?: string | null;
};

type RefreshOptions = {
  marketplaces?: ("UK" | "CA" | "US")[];
  maxProducts?: number;
  force?: boolean;
  allowSearch?: boolean;
};

function buildSearchTerms(row: KeepaProductRow) {
  const name = String(row.product_name || "").trim();
  const category = String(row.category || "").trim();
  const terms = new Set<string>();
  if (name && category) terms.add(`${name} ${category}`);
  if (name) terms.add(name);
  if (category && name) {
    const cleanedCategory = category.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (cleanedCategory) terms.add(`${name} ${cleanedCategory}`);
  }
  return Array.from(terms);
}

function nextAsin(row: KeepaProductRow, market: "UK" | "CA" | "US") {
  if (market === "UK") return row.amazon_uk_asin;
  if (market === "CA") return row.amazon_ca_asin;
  return row.amazon_us_asin;
}

function marketColumns(market: "UK" | "CA" | "US") {
  if (market === "US") {
    return {
      asin: "amazon_us_asin",
      url: "amazon_us_url",
      currency: "amazon_us_currency",
      priceLow: "amazon_us_price_low",
      priceHigh: "amazon_us_price_high",
      priceCurrent: "amazon_us_price_current",
      priceAvg30: "amazon_us_price_avg30",
      priceAvg90: "amazon_us_price_avg90",
      priceMin: "amazon_us_price_min",
      priceMax: "amazon_us_price_max",
      offerCount: "amazon_us_offer_count",
      checkedAt: "amazon_us_last_checked_at",
    } as const;
  }
  if (market === "UK") {
      return {
        asin: "amazon_uk_asin",
        url: "amazon_uk_url",
        currency: "amazon_uk_currency",
        priceLow: "amazon_uk_price_low",
        priceHigh: "amazon_uk_price_high",
        priceCurrent: "amazon_uk_price_current",
        priceAvg30: "amazon_uk_price_avg30",
        priceAvg90: "amazon_uk_price_avg90",
        priceMin: "amazon_uk_price_min",
        priceMax: "amazon_uk_price_max",
        offerCount: "amazon_uk_offer_count",
        checkedAt: "amazon_uk_last_checked_at",
      } as const;
  }
  return {
    asin: "amazon_ca_asin",
    url: "amazon_ca_url",
    currency: "amazon_ca_currency",
    priceLow: "amazon_ca_price_low",
    priceHigh: "amazon_ca_price_high",
    priceCurrent: "amazon_ca_price_current",
    priceAvg30: "amazon_ca_price_avg30",
    priceAvg90: "amazon_ca_price_avg90",
    priceMin: "amazon_ca_price_min",
    priceMax: "amazon_ca_price_max",
    offerCount: "amazon_ca_offer_count",
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

  const allowSearch = Boolean(options.allowSearch);

  for (const row of rows.slice(0, maxProducts)) {
    for (const market of marketplaces) {
      const cols = marketColumns(market);
      let asin = nextAsin(row, market);
      try {
        if (!asin && allowSearch) {
          const terms = buildSearchTerms(row);
          for (const term of terms) {
            asin = await searchKeepaAsin(term, market);
            if (asin) break;
          }
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
              ${cols.priceCurrent} = ?,
              ${cols.priceAvg30} = ?,
              ${cols.priceAvg90} = ?,
              ${cols.priceMin} = ?,
              ${cols.priceMax} = ?,
              ${cols.offerCount} = ?,
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
            price.price_current,
            price.price_avg30,
            price.price_avg90,
            price.price_min,
            price.price_max,
            price.offer_count,
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
    SELECT p.id, p.product_name, p.category, p.amazon_uk_asin, p.amazon_ca_asin, p.amazon_us_asin
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
