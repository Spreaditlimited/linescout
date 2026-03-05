import crypto from "crypto";
import type { PoolConnection } from "mysql2/promise";
import { buildOtpEmail } from "@/lib/otp-email";

export type AffiliateCommissionType =
  | "commitment_fee"
  | "project_payment"
  | "shipping_payment"
  | "future_service";

export type AffiliatePayoutProvider = "paystack" | "paypal";

export function normalizeEmail(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

export function randomCode(len = 6) {
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function ensureAffiliateTables(conn: PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(200) NOT NULL,
      email_normalized VARCHAR(200) NOT NULL,
      name VARCHAR(200) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      referral_code VARCHAR(32) NOT NULL,
      country_id INT NULL,
      payout_currency VARCHAR(8) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_affiliate_email (email_normalized),
      UNIQUE KEY uniq_affiliate_code (referral_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NOT NULL,
      session_token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      user_agent VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      last_seen_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_affiliate_session_affiliate (affiliate_id),
      KEY idx_affiliate_session_token (session_token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_login_otps (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NULL,
      email VARCHAR(200) NOT NULL,
      email_normalized VARCHAR(200) NOT NULL,
      otp_code CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_affiliate_otp_email (email_normalized),
      KEY idx_affiliate_otp_affiliate (affiliate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_referrals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NOT NULL,
      referred_user_id BIGINT UNSIGNED NOT NULL,
      source VARCHAR(24) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_affiliate_ref_user (referred_user_id),
      KEY idx_affiliate_ref_affiliate (affiliate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_commission_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      transaction_type VARCHAR(40) NOT NULL,
      mode VARCHAR(16) NOT NULL,
      value DECIMAL(14,4) NOT NULL,
      currency VARCHAR(8) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_affiliate_commission_type (transaction_type),
      KEY idx_affiliate_commission_type (transaction_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_earnings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NOT NULL,
      referred_user_id BIGINT UNSIGNED NOT NULL,
      transaction_type VARCHAR(40) NOT NULL,
      source_table VARCHAR(64) NOT NULL,
      source_id VARCHAR(64) NOT NULL,
      base_amount DECIMAL(14,2) NOT NULL,
      commission_amount DECIMAL(14,2) NOT NULL,
      currency VARCHAR(8) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'approved',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_affiliate_earning_source (affiliate_id, source_table, source_id, transaction_type),
      KEY idx_affiliate_earnings_affiliate (affiliate_id),
      KEY idx_affiliate_earnings_user (referred_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_payout_accounts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NOT NULL,
      provider VARCHAR(16) NOT NULL,
      provider_account VARCHAR(200) NOT NULL,
      country_id INT NULL,
      currency VARCHAR(8) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      verified_at DATETIME NULL,
      paystack_ref VARCHAR(120) NULL,
      meta_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_affiliate_payout (affiliate_id, provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_affiliate_payout_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      affiliate_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      currency VARCHAR(8) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      requested_note VARCHAR(255) NULL,
      admin_note VARCHAR(255) NULL,
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME NULL,
      paid_at DATETIME NULL,
      paid_by_internal_user_id BIGINT UNSIGNED NULL,
      paystack_transfer_code VARCHAR(120) NULL,
      paystack_reference VARCHAR(120) NULL,
      paypal_payout_id VARCHAR(120) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_affiliate_payout_status (status),
      KEY idx_affiliate_payout_affiliate (affiliate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

export async function ensureAffiliateSettingsColumns(conn: PoolConnection) {
  const ensureColumn = async (column: string, type: string) => {
    const [rows]: any = await conn.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_settings'
        AND column_name = ?
      LIMIT 1
      `,
      [column]
    );
    if (!rows?.length) {
      await conn.query(`ALTER TABLE linescout_settings ADD COLUMN ${column} ${type}`);
    }
  };

  await ensureColumn("affiliate_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("affiliate_terms_url", "VARCHAR(400) NULL");
  await ensureColumn("affiliate_min_payout_amount", "DECIMAL(14,2) NOT NULL DEFAULT 0");
  await ensureColumn("affiliate_min_payout_currency", "VARCHAR(8) NULL");
  await ensureColumn("affiliate_min_payouts_json", "TEXT NULL");
  await ensureColumn("affiliate_promo_videos_json", "JSON NULL");
}

export async function resolveCountryCurrency(conn: PoolConnection, countryId: number | null) {
  if (!countryId) return null;
  const [rows]: any = await conn.query(
    `
    SELECT c.id, c.iso2, cur.code AS currency_code
    FROM linescout_countries c
    LEFT JOIN linescout_currencies cur ON cur.id = c.default_currency_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [countryId]
  );
  if (!rows?.length) return null;
  const row = rows[0];
  return {
    country_id: Number(row.id),
    country_iso2: String(row.iso2 || "").toUpperCase(),
    currency_code: String(row.currency_code || "").toUpperCase(),
  };
}

export async function buildAffiliateOtpEmail(otp: string) {
  return buildOtpEmail({ otp });
}

export async function getAffiliateByEmail(conn: PoolConnection, email: string) {
  const normalized = normalizeEmail(email);
  const [rows]: any = await conn.query(
    `SELECT * FROM linescout_affiliates WHERE email_normalized = ? LIMIT 1`,
    [normalized]
  );
  return rows?.[0] || null;
}

export async function createAffiliate(conn: PoolConnection, params: {
  email: string;
  name: string;
  country_id: number | null;
  payout_currency: string | null;
}) {
  const email = String(params.email || "").trim();
  const normalized = normalizeEmail(email);
  const name = String(params.name || "").trim();
  const referralCode = generateReferralCode(email);

  const [res]: any = await conn.query(
    `
    INSERT INTO linescout_affiliates
      (email, email_normalized, name, status, referral_code, country_id, payout_currency)
    VALUES
      (?, ?, ?, 'active', ?, ?, ?)
    `,
    [email, normalized, name || null, referralCode, params.country_id || null, params.payout_currency || null]
  );

  const id = Number(res.insertId || 0);
  const [rows]: any = await conn.query(`SELECT * FROM linescout_affiliates WHERE id = ? LIMIT 1`, [id]);
  return rows?.[0] || null;
}

export function generateReferralCode(seed: string) {
  const clean = normalizeEmail(seed) || randomToken(8);
  const hash = crypto.createHash("sha256").update(clean + Date.now().toString()).digest("hex");
  return hash.slice(0, 8).toUpperCase();
}

export async function attachAffiliateReferral(conn: PoolConnection, params: {
  affiliate_code: string | null;
  referred_user_id: number;
  source?: string | null;
}) {
  const code = String(params.affiliate_code || "").trim().toUpperCase();
  if (!code || !params.referred_user_id) return { ok: false as const, reason: "missing" };

  await ensureAffiliateTables(conn);

  const [aRows]: any = await conn.query(
    `SELECT id FROM linescout_affiliates WHERE referral_code = ? LIMIT 1`,
    [code]
  );
  if (!aRows?.length) return { ok: false as const, reason: "not_found" };
  const affiliateId = Number(aRows[0].id || 0);
  if (!affiliateId) return { ok: false as const, reason: "not_found" };

  try {
    await conn.query(
      `
      INSERT INTO linescout_affiliate_referrals (affiliate_id, referred_user_id, source)
      VALUES (?, ?, ?)
      `,
      [affiliateId, params.referred_user_id, params.source || null]
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (!msg.includes("uniq_affiliate_ref_user")) throw e;
  }

  return { ok: true as const, affiliate_id: affiliateId };
}

export async function creditAffiliateEarning(conn: PoolConnection, params: {
  referred_user_id: number;
  transaction_type: AffiliateCommissionType;
  source_table: string;
  source_id: string | number;
  base_amount: number;
  currency: string;
}) {
  const userId = Number(params.referred_user_id || 0);
  if (!userId) return { ok: false as const, reason: "no_user" };

  const [refRows]: any = await conn.query(
    `SELECT affiliate_id FROM linescout_affiliate_referrals WHERE referred_user_id = ? LIMIT 1`,
    [userId]
  );
  if (!refRows?.length) return { ok: false as const, reason: "no_affiliate" };
  const affiliateId = Number(refRows[0].affiliate_id || 0);
  if (!affiliateId) return { ok: false as const, reason: "no_affiliate" };

  const [ruleRows]: any = await conn.query(
    `
    SELECT mode, value, currency
    FROM linescout_affiliate_commission_rules
    WHERE transaction_type = ? AND is_active = 1
    ORDER BY id DESC
    LIMIT 1
    `,
    [params.transaction_type]
  );
  if (!ruleRows?.length) return { ok: false as const, reason: "no_rule" };

  const rule = ruleRows[0];
  const mode = String(rule.mode || "percent").toLowerCase();
  const value = Number(rule.value || 0);
  if (!Number.isFinite(value) || value <= 0) return { ok: false as const, reason: "bad_rule" };

  const baseAmount = Number(params.base_amount || 0);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return { ok: false as const, reason: "bad_amount" };

  let commission = 0;
  if (mode === "flat") {
    commission = value;
  } else {
    commission = (baseAmount * value) / 100;
  }

  commission = Math.max(0, Number(commission.toFixed(2)));
  if (commission <= 0) return { ok: false as const, reason: "zero" };

  const sourceId = String(params.source_id || "");
  if (!sourceId) return { ok: false as const, reason: "bad_source" };

  try {
    await conn.query(
      `
      INSERT INTO linescout_affiliate_earnings
        (affiliate_id, referred_user_id, transaction_type, source_table, source_id, base_amount, commission_amount, currency, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `,
      [
        affiliateId,
        userId,
        params.transaction_type,
        params.source_table,
        sourceId,
        baseAmount,
        commission,
        String(params.currency || "").toUpperCase() || "NGN",
      ]
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (!msg.includes("uniq_affiliate_earning_source")) throw e;
  }

  return { ok: true as const, affiliate_id: affiliateId, commission };
}

export async function getAffiliateEarningsSnapshot(conn: PoolConnection, affiliateId: number) {
  const id = Number(affiliateId || 0);
  if (!id) return null;

  const [earnedRows]: any = await conn.query(
    `
    SELECT COALESCE(SUM(commission_amount), 0) AS total_earned
    FROM linescout_affiliate_earnings
    WHERE affiliate_id = ? AND status = 'approved'
    `,
    [id]
  );

  const [paidRows]: any = await conn.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM linescout_affiliate_payout_requests
    WHERE affiliate_id = ? AND status = 'paid'
    `,
    [id]
  );

  const [lockedRows]: any = await conn.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS total_locked
    FROM linescout_affiliate_payout_requests
    WHERE affiliate_id = ? AND status IN ('pending', 'approved')
    `,
    [id]
  );

  const totalEarned = Number(earnedRows?.[0]?.total_earned || 0);
  const totalPaid = Number(paidRows?.[0]?.total_paid || 0);
  const totalLocked = Number(lockedRows?.[0]?.total_locked || 0);
  const available = Math.max(0, totalEarned - totalPaid - totalLocked);

  return {
    total_earned: totalEarned,
    total_paid: totalPaid,
    total_locked: totalLocked,
    available,
  };
}
