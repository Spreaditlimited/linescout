import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensureCountryConfig } from "@/lib/country-config";
import { ensureBankAccountCountryColumns } from "@/lib/bank-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieName = String(process.env.INTERNAL_AUTH_COOKIE_NAME || "").trim();
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.role
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );
    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (String(rows[0].role || "") !== "admin") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }
    return { ok: true as const };
  } finally {
    conn.release();
  }
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

async function validateRelations(conn: any, countryId: number, currencyCode: string) {
  const [countryRows]: any = await conn.query(
    `SELECT id FROM linescout_countries WHERE id = ? AND is_active = 1 LIMIT 1`,
    [countryId]
  );
  if (!countryRows?.length) return "Invalid country";

  const [currencyRows]: any = await conn.query(
    `SELECT code FROM linescout_currencies WHERE code = ? AND is_active = 1 LIMIT 1`,
    [currencyCode]
  );
  if (!currencyRows?.length) return "Invalid currency";
  return null;
}

async function resolveBankId(conn: any, bankName: string) {
  const [rows]: any = await conn.query(
    `SELECT id
     FROM linescout_banks
     WHERE LOWER(TRIM(name)) = LOWER(?)
     LIMIT 1`,
    [bankName]
  );
  if (rows?.length) {
    const bankId = Number(rows[0].id || 0);
    await conn.query(`UPDATE linescout_banks SET is_active = 1 WHERE id = ?`, [bankId]);
    return bankId;
  }

  try {
    const [result]: any = await conn.query(
      `INSERT INTO linescout_banks (name, is_active) VALUES (?, 1)`,
      [bankName]
    );
    return Number(result?.insertId || 0);
  } catch (error: any) {
    if (!String(error?.message || "").toLowerCase().includes("duplicate")) throw error;
    const [retryRows]: any = await conn.query(
      `SELECT id FROM linescout_banks WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`,
      [bankName]
    );
    return Number(retryRows?.[0]?.id || 0);
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureBankAccountCountryColumns(conn);
    const [rows]: any = await conn.query(
      `SELECT
         a.id,
         a.bank_id,
         b.name AS bank_name,
         a.country_id,
         c.name AS country_name,
         c.iso2 AS country_iso2,
         a.currency_code,
         a.purpose,
         a.account_name,
         a.account_number,
         a.sort_code,
         a.iban,
         a.swift_bic,
         a.is_active
       FROM linescout_bank_accounts a
       JOIN linescout_banks b ON b.id = a.bank_id
       LEFT JOIN linescout_countries c ON c.id = a.country_id
       ORDER BY c.name ASC, b.name ASC, a.id ASC`
    );
    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id || 0);
  const bankName = clean(body?.bank_name, 190);
  const countryId = Number(body?.country_id || 0);
  const currencyCode = clean(body?.currency_code, 8).toUpperCase();
  const accountName = clean(body?.account_name, 190);
  const accountNumber = clean(body?.account_number, 20);
  const purpose = clean(body?.purpose, 50) || "general";
  const sortCode = clean(body?.sort_code, 16) || null;
  const iban = clean(body?.iban, 64).toUpperCase() || null;
  const swiftBic = clean(body?.swift_bic, 32).toUpperCase() || null;
  const isActive = body?.is_active === 0 || body?.is_active === false ? 0 : 1;

  if (!bankName || !countryId || !currencyCode || !accountName || !accountNumber) {
    return NextResponse.json(
      { ok: false, error: "Bank, country, currency, account name and account number are required." },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await ensureCountryConfig(conn);
    await ensureBankAccountCountryColumns(conn);
    const relationError = await validateRelations(conn, countryId, currencyCode);
    if (relationError) {
      return NextResponse.json({ ok: false, error: relationError }, { status: 400 });
    }
    const bankId = await resolveBankId(conn, bankName);
    if (!bankId) {
      return NextResponse.json({ ok: false, error: "Unable to create or find bank." }, { status: 500 });
    }

    if (id) {
      const [result]: any = await conn.query(
        `UPDATE linescout_bank_accounts
         SET bank_id = ?,
             country_id = ?,
             currency_code = ?,
             purpose = ?,
             account_name = ?,
             account_number = ?,
             sort_code = ?,
             iban = ?,
             swift_bic = ?,
             is_active = ?
         WHERE id = ?`,
        [
          bankId,
          countryId,
          currencyCode,
          purpose,
          accountName,
          accountNumber,
          sortCode,
          iban,
          swiftBic,
          isActive,
          id,
        ]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        return NextResponse.json({ ok: false, error: "Bank account not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, id });
    }

    const [result]: any = await conn.query(
      `INSERT INTO linescout_bank_accounts
       (bank_id, country_id, currency_code, purpose, account_name, account_number, sort_code, iban, swift_bic, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bankId,
        countryId,
        currencyCode,
        purpose,
        accountName,
        accountNumber,
        sortCode,
        iban,
        swiftBic,
        isActive,
      ]
    );
    return NextResponse.json({ ok: true, id: Number(result?.insertId || 0) });
  } finally {
    conn.release();
  }
}
