import crypto from "crypto";
import type { PoolConnection } from "mysql2/promise";
import { buildOtpEmail } from "@/lib/otp-email";
import { enqueueCentralAffiliateEvent } from "@/lib/central-affiliate-events";
import { getHistoricalUsdRate } from "@/lib/fx";

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

export async function ensureAffiliateTables(_conn: PoolConnection) {
  // The legacy schema is migration-managed. Request paths must never run DDL.
  void _conn;
  return;
}

export async function ensureLegacyAffiliateTables(conn: PoolConnection) {
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

  const [existingClaims]: any = await conn.query(
    `SELECT referral_code FROM linescout_central_affiliate_referrals WHERE referred_user_id = ? LIMIT 1`,
    [params.referred_user_id]
  );
  if (existingClaims?.length) {
    const existingCode = String(existingClaims[0].referral_code || "").trim().toUpperCase();
    if (existingCode) {
      await enqueueCentralAffiliateEvent(conn, {
        eventId: `linescout:referral:${params.referred_user_id}`,
        eventType: "REFERRAL_CLAIMED",
        occurredAt: new Date().toISOString(),
        customerReference: `linescout:user:${params.referred_user_id}`,
        referralCode: existingCode,
        metadata: { source: params.source || null },
      });
    }
    return { ok: true as const, affiliate_id: null };
  }

  const [aRows]: any = await conn.query(
    `SELECT id FROM linescout_affiliates WHERE referral_code = ? LIMIT 1`,
    [code]
  );
  const affiliateId = Number(aRows?.[0]?.id || 0) || null;

  try {
    if (affiliateId) {
      await conn.query(
        `INSERT INTO linescout_affiliate_referrals (affiliate_id, referred_user_id, source) VALUES (?, ?, ?)`,
        [affiliateId, params.referred_user_id, params.source || null]
      );
    }
    await conn.query(
      `INSERT INTO linescout_central_affiliate_referrals (referred_user_id, referral_code, source) VALUES (?, ?, ?)`,
      [params.referred_user_id, code, params.source || null]
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (!msg.includes("uniq_affiliate_ref_user") && !msg.includes("uniq_central_affiliate_ref_user")) throw e;
  }

  await enqueueCentralAffiliateEvent(conn, {
    eventId: `linescout:referral:${params.referred_user_id}`,
    eventType: "REFERRAL_CLAIMED",
    occurredAt: new Date().toISOString(),
    customerReference: `linescout:user:${params.referred_user_id}`,
    referralCode: code,
    metadata: { source: params.source || null },
  });

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
    `SELECT c.referral_code
     FROM linescout_central_affiliate_referrals c
     WHERE c.referred_user_id = ?
     UNION ALL
     SELECT a.referral_code
     FROM linescout_affiliate_referrals r
     JOIN linescout_affiliates a ON a.id = r.affiliate_id
     WHERE r.referred_user_id = ?
     LIMIT 1`,
    [userId, userId]
  );
  if (!refRows?.length) return { ok: false as const, reason: "no_affiliate" };
  const referralCode = String(refRows[0].referral_code || "").trim().toUpperCase();
  if (!referralCode) return { ok: false as const, reason: "no_affiliate" };

  const sourceId = String(params.source_id || "");
  if (!sourceId) return { ok: false as const, reason: "bad_source" };
  const currency = String(params.currency || "NGN").trim().toUpperCase();
  let settlementAmount: number | null = null;
  let fxRate: number | null = null;
  let fxSource: string | null = null;
  if (currency !== "NGN" && currency !== "USD") {
    const snapshot = await getHistoricalUsdRate(conn, currency, new Date());
    fxRate = snapshot?.rate || null;
    fxSource = snapshot?.source || null;
    if (!fxRate) return { ok: false as const, reason: "missing_fx" };
    settlementAmount = fxRate ? Number((Number(params.base_amount || 0) * fxRate).toFixed(2)) : null;
  }

  let shipping: { billingUnit: "KG" | "CBM"; eligibleQuantity: number; destinationCountry: string; shippingMode: "AIR" | "SEA" } | null = null;
  if (params.transaction_type === "shipping_payment" && params.source_table === "linescout_quote_payments") {
    const [shippingRows]: any = await conn.query(
      `SELECT q.shipping_actual_rate_unit, q.shipping_actual_weight_kg, q.shipping_actual_cbm,
              COALESCE(c.name, 'NIGERIA') AS destination_country,
              COALESCE(st.name, 'AIR') AS shipping_mode
       FROM linescout_quote_payments p
       JOIN linescout_quotes q ON q.id = p.quote_id
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       LEFT JOIN linescout_shipping_types st ON st.id = p.shipping_type_id
       WHERE p.id = ? LIMIT 1`,
      [sourceId]
    );
    const row = shippingRows?.[0];
    const billingUnit = String(row?.shipping_actual_rate_unit || "").toLowerCase() === "per_cbm" ? "CBM" : "KG";
    const quantity = Number(billingUnit === "CBM" ? row?.shipping_actual_cbm : row?.shipping_actual_weight_kg);
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false as const, reason: "missing_shipping_quantity" };
    shipping = { billingUnit, eligibleQuantity: quantity, destinationCountry: String(row?.destination_country || "NIGERIA").toUpperCase(), shippingMode: String(row?.shipping_mode || "AIR").toUpperCase().includes("SEA") ? "SEA" : "AIR" };
  } else if (params.transaction_type === "shipping_payment" && params.source_table === "linescout_shipping_quote_payments") {
    const [shippingRows]: any = await conn.query(
      `SELECT q.shipping_rate_unit, q.total_weight_kg, q.total_cbm,
              COALESCE(c.name, 'NIGERIA') AS destination_country,
              COALESCE(st.name, 'AIR') AS shipping_mode
       FROM linescout_shipping_quote_payments p
       JOIN linescout_shipping_quotes q ON q.id = p.shipping_quote_id
       LEFT JOIN linescout_countries c ON c.id = q.country_id
       LEFT JOIN linescout_shipping_types st ON st.id = q.shipping_type_id
       WHERE p.id = ? LIMIT 1`,
      [sourceId]
    );
    const row = shippingRows?.[0];
    const billingUnit = String(row?.shipping_rate_unit || "").toLowerCase() === "per_cbm" ? "CBM" : "KG";
    const quantity = Number(billingUnit === "CBM" ? row?.total_cbm : row?.total_weight_kg);
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false as const, reason: "missing_shipping_quantity" };
    shipping = { billingUnit, eligibleQuantity: quantity, destinationCountry: String(row?.destination_country || "NIGERIA").toUpperCase(), shippingMode: String(row?.shipping_mode || "AIR").toUpperCase().includes("SEA") ? "SEA" : "AIR" };
  }

  await enqueueCentralAffiliateEvent(conn, {
    eventId: `linescout:payment:${params.source_table}:${sourceId}:paid`,
    eventType: "PAYMENT_STATUS_CHANGED",
    occurredAt: new Date().toISOString(),
    customerReference: `linescout:user:${userId}`,
    referralCode,
    payment: {
      type: params.source_table,
      id: sourceId,
      orderReference: `${params.source_table}:${sourceId}`,
      purpose: params.transaction_type === "commitment_fee" ? "COMMITMENT_FEE" : params.transaction_type === "shipping_payment" ? "SHIPPING_PAYMENT" : "PROJECT_PAYMENT",
      status: "COMPLETED",
      currency,
      amount: Number(params.base_amount || 0),
      eligibleAmount: Number(params.base_amount || 0),
      settlementCurrency: currency === "NGN" ? "NGN" : "USD",
      settlementAmount: currency === "NGN" || currency === "USD" ? Number(params.base_amount || 0) : settlementAmount,
      fxRate,
      fxSource,
      fxCapturedAt: fxRate ? new Date().toISOString() : null,
      billingUnit: shipping?.billingUnit || null,
      eligibleQuantity: shipping?.eligibleQuantity || null,
      destinationCountry: shipping?.destinationCountry || null,
      shippingMode: shipping?.shippingMode || null,
    },
  });
  return { ok: true as const, queued: true };
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
