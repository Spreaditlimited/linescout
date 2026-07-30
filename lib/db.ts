// lib/db.ts
import mysql, { RowDataPacket } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __linescoutDbPool: mysql.Pool | undefined;
}

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

const connectionLimit = boundedPositiveInteger(
  process.env.DB_CONNECTION_LIMIT,
  2,
  1,
  10
);
const queueLimit = boundedPositiveInteger(
  process.env.DB_QUEUE_LIMIT,
  100,
  1,
  1000
);
const connectTimeout = boundedPositiveInteger(
  process.env.DB_CONNECT_TIMEOUT_MS,
  10_000,
  1_000,
  30_000
);

const pool =
  global.__linescoutDbPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit,
    maxIdle: connectionLimit,
    idleTimeout: 60_000,
    queueLimit,
    connectTimeout,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

global.__linescoutDbPool = pool;

export const db = pool;

export async function queryRows<T extends RowDataPacket>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function exec(
  sql: string,
  params: any[] = []
): Promise<{ insertId?: number; affectedRows?: number }> {
  const [res] = await db.query(sql, params);
  // mysql2 returns ResultSetHeader for INSERT/UPDATE/DELETE
  return res as any;
}
