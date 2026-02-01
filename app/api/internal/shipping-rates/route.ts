import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await pool.getConnection();
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

    if (!rows.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (rows[0].role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT r.id, r.shipping_type_id, t.name AS shipping_type_name,
              r.rate_value, r.rate_unit, r.currency, r.is_active, r.created_at
       FROM linescout_shipping_rates r
       JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
       ORDER BY r.id DESC`
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
  const shipping_type_id = Number(body?.shipping_type_id);
  const rate_value = Number(body?.rate_value);
  const rate_unit = String(body?.rate_unit || "").trim();
  const currency = String(body?.currency || "NGN").trim() || "NGN";

  if (!shipping_type_id || Number.isNaN(shipping_type_id)) {
    return NextResponse.json({ ok: false, error: "Invalid shipping_type_id" }, { status: 400 });
  }
  if (!Number.isFinite(rate_value) || rate_value <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid rate_value" }, { status: 400 });
  }
  if (rate_unit !== "per_kg" && rate_unit !== "per_cbm") {
    return NextResponse.json({ ok: false, error: "Invalid rate_unit" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const [result]: any = await conn.query(
      `INSERT INTO linescout_shipping_rates
       (shipping_type_id, rate_value, rate_unit, currency, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [shipping_type_id, rate_value, rate_unit, currency]
    );

    return NextResponse.json({ ok: true, id: result.insertId });
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const is_active = body?.is_active === 0 ? 0 : 1;
  const rate_value = body?.rate_value;
  const rate_unit = body?.rate_unit;

  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const setParts: string[] = ["is_active = ?"];
    const params: any[] = [is_active];

    if (rate_value !== undefined) {
      const rateNum = Number(rate_value);
      if (!Number.isFinite(rateNum) || rateNum <= 0) {
        return NextResponse.json({ ok: false, error: "Invalid rate_value" }, { status: 400 });
      }
      setParts.push("rate_value = ?");
      params.push(rateNum);
    }

    if (rate_unit !== undefined) {
      if (rate_unit !== "per_kg" && rate_unit !== "per_cbm") {
        return NextResponse.json({ ok: false, error: "Invalid rate_unit" }, { status: 400 });
      }
      setParts.push("rate_unit = ?");
      params.push(rate_unit);
    }

    params.push(id);
    await conn.query(`UPDATE linescout_shipping_rates SET ${setParts.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
