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
  const [columns]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'agent_otp_mode'
    LIMIT 1
    `
  );

  const hasOtpMode = !!columns?.length;
  if (!hasOtpMode) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN agent_otp_mode VARCHAR(16) NOT NULL DEFAULT 'phone'`
    );
  }

  const [pointsCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'points_value_ngn'
    LIMIT 1
    `
  );
  if (!pointsCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN points_value_ngn BIGINT NOT NULL DEFAULT 0`
    );
  }
  const [configCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'points_config_json'
    LIMIT 1
    `
  );
  if (!configCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN points_config_json JSON NULL`
    );
  }

  const [rows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  if (rows?.length) return rows[0];

  await conn.query(
    `INSERT INTO linescout_settings
     (commitment_due_ngn, agent_percent, agent_commitment_percent, markup_percent, exchange_rate_usd, exchange_rate_rmb, payout_summary_email, agent_otp_mode, points_value_ngn, points_config_json)
     VALUES (0, 5, 40, 20, 0, 0, NULL, 'phone', 0, NULL)`
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
  const points_value_ngn = num(body.points_value_ngn);
  const points_config_json = body?.points_config_json ?? null;
  const payout_summary_email =
    typeof body.payout_summary_email === "string" ? body.payout_summary_email.trim() : "";
  const agent_otp_mode =
    body?.agent_otp_mode === "email" || body?.agent_otp_mode === "phone"
      ? body.agent_otp_mode
      : "phone";

  const values = {
    commitment_due_ngn,
    agent_percent,
    agent_commitment_percent,
    markup_percent,
    exchange_rate_usd,
    exchange_rate_rmb,
    points_value_ngn,
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
           points_value_ngn = ?,
           points_config_json = ?,
           payout_summary_email = ?,
           agent_otp_mode = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        commitment_due_ngn,
        agent_percent,
        agent_commitment_percent,
        markup_percent,
        exchange_rate_usd,
        exchange_rate_rmb,
        points_value_ngn,
        points_config_json ? JSON.stringify(points_config_json) : null,
        payout_summary_email || null,
        agent_otp_mode,
        row.id,
      ]
    );

    const [after]: any = await conn.query("SELECT * FROM linescout_settings WHERE id = ?", [row.id]);
    return NextResponse.json({ ok: true, item: after?.[0] || null });
  } finally {
    conn.release();
  }
}
