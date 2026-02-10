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

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        h.*,
        COALESCE(
          NULLIF(TRIM(h.customer_name), ''),
          NULLIF(TRIM(l.name), ''),
          NULLIF(TRIM(u.display_name), ''),
          NULLIF(TRIM(u.email), '')
        ) AS customer_name,
        COALESCE(
          NULLIF(TRIM(h.whatsapp_number), ''),
          NULLIF(TRIM(l.whatsapp), '')
        ) AS customer_whatsapp
      FROM linescout_handoffs h
      LEFT JOIN linescout_conversations c ON c.id = h.conversation_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN (
        SELECT l1.email, l1.name, l1.whatsapp
        FROM linescout_leads l1
        JOIN (
          SELECT email, MAX(id) AS max_id
          FROM linescout_leads
          WHERE email IS NOT NULL AND email <> ''
          GROUP BY email
        ) latest ON latest.email = l1.email AND latest.max_id = l1.id
      ) l ON l.email = u.email
      ORDER BY h.created_at DESC
      LIMIT 200
      `
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
