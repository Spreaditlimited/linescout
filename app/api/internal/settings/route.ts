import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";
import { ensureCountryConfig } from "@/lib/country-config";

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

  const [stickyEnabledCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'sticky_notice_enabled'
    LIMIT 1
    `
  );
  if (!stickyEnabledCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN sticky_notice_enabled TINYINT(1) NOT NULL DEFAULT 0`
    );
  }

  const [stickyTitleCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'sticky_notice_title'
    LIMIT 1
    `
  );
  if (!stickyTitleCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN sticky_notice_title VARCHAR(200) NULL`
    );
  }

  const [stickyBodyCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'sticky_notice_body'
    LIMIT 1
    `
  );
  if (!stickyBodyCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN sticky_notice_body TEXT NULL`
    );
  }

  const [stickyTargetCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'sticky_notice_target'
    LIMIT 1
    `
  );
  if (!stickyTargetCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN sticky_notice_target VARCHAR(16) NOT NULL DEFAULT 'both'`
    );
  }

  const [stickyVersionCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'sticky_notice_version'
    LIMIT 1
    `
  );
  if (!stickyVersionCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN sticky_notice_version INT NOT NULL DEFAULT 0`
    );
  }

  const [testEmailCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'test_emails_json'
    LIMIT 1
    `
  );
  if (!testEmailCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN test_emails_json JSON NULL`
    );
  }

  const [claimLimitCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'linescout_settings'
      AND column_name = 'max_active_claims'
    LIMIT 1
    `
  );
  if (!claimLimitCols?.length) {
    await conn.query(
      `ALTER TABLE linescout_settings ADD COLUMN max_active_claims INT NOT NULL DEFAULT 3`
    );
  }

  const [rows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  if (rows?.length) return rows[0];

  await conn.query(
    `INSERT INTO linescout_settings
     (commitment_due_ngn, agent_percent, agent_commitment_percent, markup_percent, exchange_rate_usd, exchange_rate_rmb, payout_summary_email, agent_otp_mode, points_value_ngn, points_config_json, sticky_notice_enabled, sticky_notice_title, sticky_notice_body, sticky_notice_target, sticky_notice_version, test_emails_json, max_active_claims)
     VALUES (0, 5, 40, 20, 0, 0, NULL, 'phone', 0, NULL, 0, NULL, NULL, 'both', 0, NULL, 3)`
  );

  const [after]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  return after?.[0] || null;
}


export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    await ensureCountryConfig(conn);
    const row = await ensureRow(conn);
    const [currencies]: any = await conn.query(
      `SELECT id, code, symbol, decimal_places, display_format, is_active
       FROM linescout_currencies
       ORDER BY code ASC`
    );
    const [countries]: any = await conn.query(
      `SELECT c.id, c.name, c.iso2, c.iso3, c.default_currency_id, c.settlement_currency_code, c.payment_provider, c.is_active,
              cur.code AS default_currency_code
       FROM linescout_countries c
       LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
       ORDER BY c.name ASC`
    );
    const [countryCurrencies]: any = await conn.query(
      `SELECT cc.country_id, cc.currency_id, cc.is_active,
              c.name AS country_name, c.iso2 AS country_iso2, cur.code AS currency_code
       FROM linescout_country_currencies cc
       JOIN linescout_countries c ON c.id = cc.country_id
       JOIN linescout_currencies cur ON cur.id = cc.currency_id
       ORDER BY c.name ASC, cur.code ASC`
    );
    const [fxRates]: any = await conn.query(
      `SELECT id, base_currency_code, quote_currency_code, rate, effective_at, created_at
       FROM linescout_fx_rates
       ORDER BY created_at DESC
       LIMIT 200`
    );

    return NextResponse.json({
      ok: true,
      item: row,
      currencies: currencies || [],
      countries: countries || [],
      country_currencies: countryCurrencies || [],
      fx_rates: fxRates || [],
    });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action.trim() : "";

  function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const conn = await pool.getConnection();

  if (action) {
    try {
      await ensureCountryConfig(conn);

      if (action === "currency.create") {
        const code = String(body?.code || "").trim().toUpperCase();
        const symbol = String(body?.symbol || "").trim() || null;
        const decimal_places = num(body?.decimal_places) ?? 2;
        const display_format = String(body?.display_format || "").trim() || null;
        if (!code || code.length > 8) {
          return NextResponse.json({ ok: false, error: "Invalid currency code" }, { status: 400 });
        }
        if (!Number.isFinite(decimal_places) || decimal_places < 0 || decimal_places > 6) {
          return NextResponse.json({ ok: false, error: "Invalid decimal places" }, { status: 400 });
        }
        await conn.query(
          `INSERT INTO linescout_currencies (code, symbol, decimal_places, display_format)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             symbol = VALUES(symbol),
             decimal_places = VALUES(decimal_places),
             display_format = VALUES(display_format)`,
          [code, symbol, decimal_places, display_format]
        );
        return NextResponse.json({ ok: true });
      }

      if (action === "currency.update") {
        const id = num(body?.id);
        if (!id) return NextResponse.json({ ok: false, error: "Invalid currency id" }, { status: 400 });
        const symbol = String(body?.symbol || "").trim() || null;
        const decimal_places = num(body?.decimal_places);
        const display_format = String(body?.display_format || "").trim() || null;
        const is_active = body?.is_active === 0 ? 0 : body?.is_active === 1 ? 1 : null;
        const sets: string[] = [];
        const params: any[] = [];
        if (symbol !== null) {
          sets.push("symbol = ?");
          params.push(symbol);
        }
        if (decimal_places !== null) {
          if (decimal_places < 0 || decimal_places > 6) {
            return NextResponse.json({ ok: false, error: "Invalid decimal places" }, { status: 400 });
          }
          sets.push("decimal_places = ?");
          params.push(decimal_places);
        }
        if (display_format !== null) {
          sets.push("display_format = ?");
          params.push(display_format);
        }
        if (is_active !== null) {
          sets.push("is_active = ?");
          params.push(is_active);
        }
        if (!sets.length) return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
        params.push(id);
        await conn.query(`UPDATE linescout_currencies SET ${sets.join(", ")} WHERE id = ?`, params);
        return NextResponse.json({ ok: true });
      }

      if (action === "country.create") {
        const name = String(body?.name || "").trim();
        const iso2 = String(body?.iso2 || "").trim().toUpperCase();
        const iso3 = String(body?.iso3 || "").trim().toUpperCase() || null;
        const default_currency_id = num(body?.default_currency_id);
        const settlement_currency_code = String(body?.settlement_currency_code || "").trim().toUpperCase() || null;
        const rawProvider = String(body?.payment_provider || "").trim();
        const payment_provider =
          rawProvider
            ? rawProvider
            : iso2 && iso2 !== "NG"
              ? "paypal"
              : null;
        if (!name || name.length < 2) {
          return NextResponse.json({ ok: false, error: "Country name is too short" }, { status: 400 });
        }
        if (!iso2 || iso2.length !== 2) {
          return NextResponse.json({ ok: false, error: "Country ISO2 must be 2 letters" }, { status: 400 });
        }
        await conn.query(
          `INSERT INTO linescout_countries (name, iso2, iso3, default_currency_id, settlement_currency_code, payment_provider)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             iso3 = VALUES(iso3),
             default_currency_id = VALUES(default_currency_id),
             settlement_currency_code = VALUES(settlement_currency_code),
             payment_provider = VALUES(payment_provider)`,
          [name, iso2, iso3, default_currency_id, settlement_currency_code, payment_provider]
        );
        return NextResponse.json({ ok: true });
      }

      if (action === "country.update") {
        const id = num(body?.id);
        if (!id) return NextResponse.json({ ok: false, error: "Invalid country id" }, { status: 400 });
        const name = String(body?.name || "").trim();
        const iso2 = String(body?.iso2 || "").trim().toUpperCase();
        const iso3 = String(body?.iso3 || "").trim().toUpperCase();
        const default_currency_id = body?.default_currency_id === null ? null : num(body?.default_currency_id);
        const settlement_currency_code = String(body?.settlement_currency_code || "").trim().toUpperCase();
        const payment_provider = String(body?.payment_provider || "").trim();
        const is_active = body?.is_active === 0 ? 0 : body?.is_active === 1 ? 1 : null;
        const sets: string[] = [];
        const params: any[] = [];
        if (name) {
          sets.push("name = ?");
          params.push(name);
        }
        if (iso2) {
          if (iso2.length !== 2) {
            return NextResponse.json({ ok: false, error: "Country ISO2 must be 2 letters" }, { status: 400 });
          }
          sets.push("iso2 = ?");
          params.push(iso2);
        }
        if (iso3) {
          sets.push("iso3 = ?");
          params.push(iso3);
        }
        if (body?.default_currency_id !== undefined) {
          sets.push("default_currency_id = ?");
          params.push(default_currency_id);
        }
        if (body?.settlement_currency_code !== undefined) {
          sets.push("settlement_currency_code = ?");
          params.push(settlement_currency_code || null);
        }
        if (body?.payment_provider !== undefined) {
          sets.push("payment_provider = ?");
          params.push(payment_provider || null);
        }
        if (is_active !== null) {
          sets.push("is_active = ?");
          params.push(is_active);
        }
        if (!sets.length) return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
        params.push(id);
        await conn.query(`UPDATE linescout_countries SET ${sets.join(", ")} WHERE id = ?`, params);
        return NextResponse.json({ ok: true });
      }

      if (action === "country_currency.create") {
        const country_id = num(body?.country_id);
        const currency_id = num(body?.currency_id);
        if (!country_id || !currency_id) {
          return NextResponse.json({ ok: false, error: "Invalid country or currency" }, { status: 400 });
        }
        await conn.query(
          `INSERT INTO linescout_country_currencies (country_id, currency_id, is_active)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [country_id, currency_id]
        );
        return NextResponse.json({ ok: true });
      }

      if (action === "country_currency.update") {
        const country_id = num(body?.country_id);
        const currency_id = num(body?.currency_id);
        const is_active = body?.is_active === 0 ? 0 : body?.is_active === 1 ? 1 : null;
        if (!country_id || !currency_id || is_active === null) {
          return NextResponse.json({ ok: false, error: "Invalid mapping or status" }, { status: 400 });
        }
        await conn.query(
          `UPDATE linescout_country_currencies
           SET is_active = ?
           WHERE country_id = ? AND currency_id = ?`,
          [is_active, country_id, currency_id]
        );
        return NextResponse.json({ ok: true });
      }

      if (action === "fx_rate.upsert") {
        const base_currency_code = String(body?.base_currency_code || "").trim().toUpperCase();
        const quote_currency_code = String(body?.quote_currency_code || "").trim().toUpperCase();
        const rate = num(body?.rate);
        const effective_at = String(body?.effective_at || "").trim();
        if (!base_currency_code || !quote_currency_code || !rate || rate <= 0) {
          return NextResponse.json({ ok: false, error: "Invalid FX rate data" }, { status: 400 });
        }
        await conn.query(
          `INSERT INTO linescout_fx_rates (base_currency_code, quote_currency_code, rate, effective_at)
           VALUES (?, ?, ?, ?)`,
          [base_currency_code, quote_currency_code, rate, effective_at || new Date()]
        );
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    } finally {
      conn.release();
    }
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
  const max_active_claims = num(body.max_active_claims);
  const hasStickyPayload =
    Object.prototype.hasOwnProperty.call(body || {}, "sticky_notice_enabled") ||
    Object.prototype.hasOwnProperty.call(body || {}, "sticky_notice_title") ||
    Object.prototype.hasOwnProperty.call(body || {}, "sticky_notice_body") ||
    Object.prototype.hasOwnProperty.call(body || {}, "sticky_notice_target") ||
    Object.prototype.hasOwnProperty.call(body || {}, "publish_sticky_notice");
  const sticky_notice_enabled = body?.sticky_notice_enabled ? 1 : 0;
  const sticky_notice_title =
    typeof body?.sticky_notice_title === "string" ? body.sticky_notice_title.trim() : "";
  const sticky_notice_body =
    typeof body?.sticky_notice_body === "string" ? body.sticky_notice_body.trim() : "";
  const sticky_notice_target =
    body?.sticky_notice_target === "user" || body?.sticky_notice_target === "agent" || body?.sticky_notice_target === "both"
      ? body.sticky_notice_target
      : "both";
  const publish_sticky_notice = Boolean(body?.publish_sticky_notice);
  const test_emails_json =
    Array.isArray(body?.test_emails_json) ? body.test_emails_json : null;

  const values = {
    commitment_due_ngn,
    agent_percent,
    agent_commitment_percent,
    markup_percent,
    exchange_rate_usd,
    exchange_rate_rmb,
    points_value_ngn,
    max_active_claims,
  };

  const invalid = Object.entries(values).find(([, v]) => v == null || Number.isNaN(v));
  if (invalid) {
    return NextResponse.json({ ok: false, error: "All fields must be valid numbers" }, { status: 400 });
  }

  try {
    await ensureCountryConfig(conn);
    const row = await ensureRow(conn);
    const prevEnabled = Number(row.sticky_notice_enabled || 0);
    const prevTitle = String(row.sticky_notice_title || "");
    const prevBody = String(row.sticky_notice_body || "");
    const prevTarget = String(row.sticky_notice_target || "both");
    const prevVersion = Number(row.sticky_notice_version || 0);

    const effectiveEnabled = hasStickyPayload ? sticky_notice_enabled : prevEnabled;
    const effectiveTitle = hasStickyPayload ? sticky_notice_title : prevTitle;
    const effectiveBody = hasStickyPayload ? sticky_notice_body : prevBody;
    const effectiveTarget = hasStickyPayload ? sticky_notice_target : prevTarget;
    const newStickyVersion =
      publish_sticky_notice ? prevVersion + 1 : prevVersion;

    if (hasStickyPayload && effectiveEnabled && (!effectiveTitle || !effectiveBody)) {
      return NextResponse.json(
        { ok: false, error: "Sticky notice title and body are required when enabled." },
        { status: 400 }
      );
    }
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
           max_active_claims = ?,
           sticky_notice_enabled = ?,
           sticky_notice_title = ?,
           sticky_notice_body = ?,
           sticky_notice_target = ?,
           sticky_notice_version = ?,
           test_emails_json = ?,
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
        max_active_claims,
        effectiveEnabled,
        effectiveTitle || null,
        effectiveBody || null,
        effectiveTarget,
        newStickyVersion,
        test_emails_json ? JSON.stringify(test_emails_json) : null,
        row.id,
      ]
    );

    const [after]: any = await conn.query("SELECT * FROM linescout_settings WHERE id = ?", [row.id]);
    return NextResponse.json({ ok: true, item: after?.[0] || null });
  } finally {
    conn.release();
  }
}
