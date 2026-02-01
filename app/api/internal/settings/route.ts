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

async function ensureRow(conn: mysql.PoolConnection) {
  const [rows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  if (rows?.length) return rows[0];

  await conn.query(
    `INSERT INTO linescout_settings
     (commitment_due_ngn, agent_percent, agent_commitment_percent, markup_percent, exchange_rate_usd, exchange_rate_rmb)
     VALUES (0, 5, 40, 20, 0, 0)`
  );

  const [after]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  return after?.[0] || null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const row = await ensureRow(conn);
    return NextResponse.json({ ok: true, item: row });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));

  function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const commitment_due_ngn = num(body.commitment_due_ngn);
  const agent_percent = num(body.agent_percent);
  const agent_commitment_percent = num(body.agent_commitment_percent);
  const markup_percent = num(body.markup_percent);
  const exchange_rate_usd = num(body.exchange_rate_usd);
  const exchange_rate_rmb = num(body.exchange_rate_rmb);

  const values = {
    commitment_due_ngn,
    agent_percent,
    agent_commitment_percent,
    markup_percent,
    exchange_rate_usd,
    exchange_rate_rmb,
  };

  const invalid = Object.entries(values).find(([, v]) => v == null || Number.isNaN(v));
  if (invalid) {
    return NextResponse.json({ ok: false, error: "All fields must be valid numbers" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    const row = await ensureRow(conn);
    await conn.query(
      `UPDATE linescout_settings
       SET commitment_due_ngn = ?,
           agent_percent = ?,
           agent_commitment_percent = ?,
           markup_percent = ?,
           exchange_rate_usd = ?,
           exchange_rate_rmb = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        commitment_due_ngn,
        agent_percent,
        agent_commitment_percent,
        markup_percent,
        exchange_rate_usd,
        exchange_rate_rmb,
        row.id,
      ]
    );

    const [after]: any = await conn.query("SELECT * FROM linescout_settings WHERE id = ?", [row.id]);
    return NextResponse.json({ ok: true, item: after?.[0] || null });
  } finally {
    conn.release();
  }
}
