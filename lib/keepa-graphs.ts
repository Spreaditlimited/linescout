import type { PoolConnection } from "mysql2/promise";

const GRAPH_TABLE = "linescout_keepa_graphs";

export async function ensureKeepaGraphsReady(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS ${GRAPH_TABLE} (
      id INT NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      marketplace VARCHAR(8) NOT NULL,
      asin VARCHAR(32) NOT NULL,
      params_hash VARCHAR(64) NOT NULL,
      content_type VARCHAR(64) NOT NULL,
      image LONGBLOB NOT NULL,
      fetched_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_product_market (product_id, marketplace),
      KEY idx_params (params_hash),
      KEY idx_fetched_at (fetched_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );
}

export async function getKeepaGraph(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  paramsHash: string
) {
  await ensureKeepaGraphsReady(conn);
  const [[row]]: any = await conn.query(
    `
    SELECT id, product_id, marketplace, asin, params_hash, content_type, image, fetched_at
    FROM ${GRAPH_TABLE}
    WHERE product_id = ? AND marketplace = ? AND params_hash = ?
    ORDER BY fetched_at DESC, id DESC
    LIMIT 1
    `,
    [productId, marketplace, paramsHash]
  );
  return row || null;
}

export async function getFreshKeepaGraph(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  paramsHash: string,
  maxAgeMs: number
) {
  const row = await getKeepaGraph(conn, productId, marketplace, paramsHash);
  if (!row?.fetched_at) return null;
  const ts = Date.parse(String(row.fetched_at));
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > maxAgeMs) return null;
  return row;
}

export async function saveKeepaGraph(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  asin: string,
  paramsHash: string,
  contentType: string,
  image: Buffer
) {
  await ensureKeepaGraphsReady(conn);
  await conn.query(
    `
    INSERT INTO ${GRAPH_TABLE} (product_id, marketplace, asin, params_hash, content_type, image, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
    `,
    [productId, marketplace, asin, paramsHash, contentType, image]
  );
}
