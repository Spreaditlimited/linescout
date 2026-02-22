import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureWhiteLabelProductsTable } from "@/lib/white-label-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };
    if (String(rows[0].role || "") !== "admin")
      return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

function parseCsv(raw: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.length > 1 || row[0]?.trim()) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function toNum(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const csv = String(body?.csv || "");
  const defaultMarketplace = String(body?.default_marketplace || "UK").trim().toUpperCase();
  if (!csv.trim()) {
    return NextResponse.json({ ok: false, error: "CSV payload is required" }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "CSV appears empty" }, { status: 400 });
  }

  const header = rows[0].map((h) => clean(h).toLowerCase());
  const dataRows = rows.slice(1);

  const colIndex = (name: string) => header.indexOf(name);
  const idxId = colIndex("id");
  const idxProductId = colIndex("product_id");
  const idxAsin = colIndex("amazon_asin");
  const idxUrl = colIndex("amazon_url");
  const idxMarketplace = colIndex("amazon_marketplace");
  const idxCurrency = colIndex("amazon_currency");
  const idxLow = colIndex("amazon_price_low");
  const idxHigh = colIndex("amazon_price_high");
  const idxChecked = colIndex("amazon_last_checked_at");

  if (idxId === -1 && idxProductId === -1) {
    return NextResponse.json({ ok: false, error: "CSV must include id or product_id column" }, { status: 400 });
  }

  const conn = await db.getConnection();
  let updated = 0;
  let skipped = 0;
  try {
    await ensureWhiteLabelProductsTable(conn);

    for (const row of dataRows) {
      const idRaw = idxId >= 0 ? row[idxId] : idxProductId >= 0 ? row[idxProductId] : "";
      const id = Number(String(idRaw || "").trim());
      if (!Number.isFinite(id) || id <= 0) {
        skipped += 1;
        continue;
      }

      const marketplace = clean(idxMarketplace >= 0 ? row[idxMarketplace] : "") || defaultMarketplace;
      const currency =
        clean(idxCurrency >= 0 ? row[idxCurrency] : "") ||
        (marketplace === "UK" ? "GBP" : marketplace === "CA" ? "CAD" : "");
      const asin = clean(idxAsin >= 0 ? row[idxAsin] : "") || null;
      const url = clean(idxUrl >= 0 ? row[idxUrl] : "") || null;
      const priceLow = toNum(idxLow >= 0 ? row[idxLow] : null);
      const priceHigh = toNum(idxHigh >= 0 ? row[idxHigh] : null);
      const checkedAt = clean(idxChecked >= 0 ? row[idxChecked] : "") || null;

      await conn.query(
        `
        UPDATE linescout_white_label_products
        SET amazon_asin = ?,
            amazon_url = ?,
            amazon_marketplace = ?,
            amazon_currency = ?,
            amazon_price_low = ?,
            amazon_price_high = ?,
            amazon_last_checked_at = ?
        WHERE id = ?
        LIMIT 1
        `,
        [
          asin,
          url,
          marketplace || null,
          currency || null,
          priceLow,
          priceHigh,
          checkedAt,
          id,
        ]
      );
      updated += 1;
    }

    return NextResponse.json({ ok: true, updated, skipped });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-products/import error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to import CSV" }, { status: 500 });
  } finally {
    conn.release();
  }
}
