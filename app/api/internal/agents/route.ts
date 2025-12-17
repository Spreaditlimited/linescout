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

    const [rows]: any = await conn.query(
      `
      SELECT id, name
      FROM linescout_agents
      WHERE is_active = 1
      ORDER BY name ASC
      `
    );

    return NextResponse.json({
      ok: true,
      items: rows,
    });
  } catch (err: any) {
    console.error("GET /api/internal/agents error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch agents" },
      { status: 500 }
    );
  } finally {
    try {
      if (conn) await conn.end();
    } catch {}
  }
}