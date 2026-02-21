import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import {
  ensureCountryConfig,
  ensureHandoffCountryColumns,
  backfillHandoffDefaults,
} from "@/lib/country-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTestEmails(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      return raw
        .split(/[\n,]/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return [];
}

export async function GET(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    const url = new URL(req.url);
    const excludeTest = url.searchParams.get("exclude_test") === "1";
    let testEmails: string[] = [];
    if (excludeTest) {
      try {
        const [settingsRows]: any = await conn.execute(
          `SELECT test_emails_json FROM linescout_settings ORDER BY id DESC LIMIT 1`
        );
        testEmails = parseTestEmails(settingsRows?.[0]?.test_emails_json);
      } catch {
        testEmails = [];
      }
    }
    const emailPlaceholders =
      excludeTest && testEmails.length
        ? testEmails.map(() => "?").join(",")
        : "";
    const emailParams =
      excludeTest && testEmails.length ? testEmails : [];
    const excludeWhere =
      excludeTest && testEmails.length
        ? `
        AND (h.email IS NULL OR LOWER(TRIM(h.email)) NOT IN (${emailPlaceholders}))
        AND (u.email IS NULL OR LOWER(TRIM(u.email)) NOT IN (${emailPlaceholders}))
        `
        : "";

    await ensureCountryConfig(conn as any);
    await ensureHandoffCountryColumns(conn as any);
    await backfillHandoffDefaults(conn as any);

    const [rows] = await conn.execute<any[]>(
      `
      SELECT
        h.*,
        COALESCE(q.quote_count, 0) AS quote_count,
        q.latest_quote_at,
        hc.name AS country_name,
        hc.iso2 AS country_iso2,
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
        SELECT handoff_id, COUNT(*) AS quote_count, MAX(created_at) AS latest_quote_at
        FROM linescout_quotes
        GROUP BY handoff_id
      ) q ON q.handoff_id = h.id
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
      LEFT JOIN linescout_countries hc ON hc.id = h.country_id
      WHERE 1=1
      ${excludeWhere}
      ORDER BY h.created_at DESC
      LIMIT 200
      `,
      [...emailParams, ...emailParams]
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
