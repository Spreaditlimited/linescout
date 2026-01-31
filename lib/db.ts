// lib/db.ts
import mysql, { RowDataPacket } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

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