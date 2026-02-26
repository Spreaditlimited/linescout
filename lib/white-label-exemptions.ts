import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export type WhiteLabelExemption = {
  id: number;
  email: string;
  email_normalized: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  source: string | null;
  created_by_internal_user_id: number | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

let exemptionsReady = false;

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function ensureWhiteLabelExemptionsTable(conn: PoolConnection) {
  if (exemptionsReady) return;

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_white_label_exemptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      email_normalized VARCHAR(255) NOT NULL,
      starts_at DATETIME NOT NULL,
      ends_at DATETIME NOT NULL,
      source VARCHAR(32) NULL,
      notes VARCHAR(255) NULL,
      created_by_internal_user_id INT NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email_normalized),
      INDEX idx_active (email_normalized, revoked_at, ends_at)
    )
    `
  );

  exemptionsReady = true;
}

export async function findActiveWhiteLabelExemption(conn: PoolConnection, email: string) {
  await ensureWhiteLabelExemptionsTable(conn);
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return null;

  const [rows] = await conn.query<RowDataPacket[]>(
    `
    SELECT *
    FROM linescout_white_label_exemptions
    WHERE email_normalized = ?
      AND revoked_at IS NULL
      AND starts_at <= NOW()
      AND ends_at >= NOW()
    ORDER BY ends_at DESC
    LIMIT 1
    `,
    [emailNorm]
  );

  return (rows?.[0] as WhiteLabelExemption) || null;
}
