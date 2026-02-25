import type { PoolConnection } from "mysql2/promise";

export type PaymentProvider = "paystack" | "paypal";

export type PaymentAttemptStatus =
  | "initiated"
  | "verified"
  | "failed";

export async function ensurePaymentAttemptsTable(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_payment_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      provider VARCHAR(16) NOT NULL,
      reference VARCHAR(120) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      route_type VARCHAR(32) NULL,
      amount DECIMAL(12,2) NULL,
      currency VARCHAR(8) NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'initiated',
      meta_json JSON NULL,
      last_error TEXT NULL,
      verified_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_provider_ref (provider, reference),
      KEY idx_user_time (user_id, created_at),
      KEY idx_status_time (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );
}

export async function recordPaymentAttempt(
  conn: PoolConnection,
  input: {
    provider: PaymentProvider;
    reference: string;
    userId: number;
    purpose: string;
    routeType?: string | null;
    amount?: number | null;
    currency?: string | null;
    meta?: Record<string, any> | null;
  }
) {
  if (!input.reference || !input.userId) return;
  await ensurePaymentAttemptsTable(conn);

  await conn.query(
    `
    INSERT INTO linescout_payment_attempts
      (provider, reference, user_id, purpose, route_type, amount, currency, status, meta_json)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 'initiated', ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      purpose = VALUES(purpose),
      route_type = VALUES(route_type),
      amount = VALUES(amount),
      currency = VALUES(currency),
      meta_json = VALUES(meta_json),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      input.provider,
      input.reference,
      input.userId,
      input.purpose,
      input.routeType || null,
      input.amount ?? null,
      input.currency || null,
      input.meta ? JSON.stringify(input.meta) : null,
    ]
  );
}

export async function updatePaymentAttempt(
  conn: PoolConnection,
  input: {
    provider: PaymentProvider;
    reference: string;
    status: PaymentAttemptStatus;
    verifiedAt?: Date | null;
    lastError?: string | null;
    meta?: Record<string, any> | null;
  }
) {
  if (!input.reference) return;
  await ensurePaymentAttemptsTable(conn);

  await conn.query(
    `
    UPDATE linescout_payment_attempts
    SET status = ?,
        verified_at = ?,
        last_error = ?,
        meta_json = COALESCE(?, meta_json),
        updated_at = CURRENT_TIMESTAMP
    WHERE provider = ? AND reference = ?
    LIMIT 1
    `,
    [
      input.status,
      input.verifiedAt || null,
      input.lastError || null,
      input.meta ? JSON.stringify(input.meta) : null,
      input.provider,
      input.reference,
    ]
  );
}

export async function findPaymentAttempt(
  conn: PoolConnection,
  provider: PaymentProvider,
  reference: string
) {
  await ensurePaymentAttemptsTable(conn);
  const [rows]: any = await conn.query(
    `
    SELECT *
    FROM linescout_payment_attempts
    WHERE provider = ? AND reference = ?
    LIMIT 1
    `,
    [provider, reference]
  );
  return rows?.[0] || null;
}

export async function listStuckPaymentAttempts(
  conn: PoolConnection,
  input: { olderThanMinutes: number; limit: number }
) {
  await ensurePaymentAttemptsTable(conn);
  const [rows]: any = await conn.query(
    `
    SELECT *
    FROM linescout_payment_attempts
    WHERE status = 'initiated'
      AND created_at <= (NOW() - INTERVAL ? MINUTE)
      AND created_at >= (NOW() - INTERVAL 7 DAY)
    ORDER BY created_at ASC
    LIMIT ?
    `,
    [input.olderThanMinutes, input.limit]
  );
  return rows || [];
}
