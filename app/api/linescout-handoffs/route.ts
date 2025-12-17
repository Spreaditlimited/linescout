import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    // ✅ Use SELECT * so schema changes don't break this endpoint
    const [rows] = await conn.execute<any[]>(
      "SELECT * FROM linescout_handoffs ORDER BY created_at DESC LIMIT 200"
    );

    return NextResponse.json({ ok: true, handoffs: rows || [] });
  } catch (err: any) {
    console.error("handoffs fetch error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch handoffs" },
      { status: 500 }
    );
  } finally {
    try {
      if (conn) await conn.end();
    } catch {}
  }
}