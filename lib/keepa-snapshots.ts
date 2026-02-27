import type { PoolConnection } from "mysql2/promise";

const SNAPSHOT_TABLE = "linescout_keepa_snapshots";

export async function ensureKeepaSnapshotsReady(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      id INT NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      marketplace VARCHAR(8) NOT NULL,
      asin VARCHAR(32) NULL,
      source VARCHAR(32) NULL,
      fetched_at DATETIME NOT NULL,
      raw_json LONGTEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_product_market (product_id, marketplace),
      KEY idx_fetched_at (fetched_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );
}

export async function getKeepaSnapshot(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  source?: string | null
) {
  await ensureKeepaSnapshotsReady(conn);
  const whereSource = source ? "AND source = ?" : "";
  const params = source ? [productId, marketplace, source] : [productId, marketplace];
  const [[row]]: any = await conn.query(
    `
    SELECT id, product_id, marketplace, asin, source, fetched_at, raw_json
    FROM ${SNAPSHOT_TABLE}
    WHERE product_id = ? AND marketplace = ?
    ${whereSource}
    ORDER BY fetched_at DESC, id DESC
    LIMIT 1
    `,
    params
  );
  return row || null;
}

export async function getFreshKeepaSnapshot(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  maxAgeMs: number,
  source?: string | null
) {
  const row = await getKeepaSnapshot(conn, productId, marketplace, source);
  if (!row?.fetched_at) return null;
  const ts = Date.parse(String(row.fetched_at));
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > maxAgeMs) return null;
  return row;
}

export async function saveKeepaSnapshot(
  conn: PoolConnection,
  productId: number,
  marketplace: string,
  asin: string | null,
  source: string,
  raw: any
) {
  await ensureKeepaSnapshotsReady(conn);
  const payload = JSON.stringify(raw ?? {});
  await conn.query(
    `
    INSERT INTO ${SNAPSHOT_TABLE} (product_id, marketplace, asin, source, fetched_at, raw_json)
    VALUES (?, ?, ?, ?, NOW(), ?)
    `,
    [productId, marketplace, asin, source, payload]
  );
}
