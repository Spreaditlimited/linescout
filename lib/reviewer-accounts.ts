import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export type ReviewerAccount = {
  id: number;
  app_target: "mobile" | "agent";
  auth_channel: "email" | "phone";
  email: string | null;
  email_normalized: string | null;
  phone: string | null;
  phone_normalized: string | null;
  fixed_otp: string | null;
  bypass_enabled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

let reviewerTableReady = false;

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  return String(phone || "").trim().replace(/\s+/g, "");
}

export async function ensureReviewerTable(conn: PoolConnection) {
  if (reviewerTableReady) return;

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_reviewer_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      app_target VARCHAR(16) NOT NULL,
      auth_channel VARCHAR(16) NOT NULL DEFAULT 'email',
      email VARCHAR(255) NULL,
      email_normalized VARCHAR(255) NULL,
      phone VARCHAR(32) NULL,
      phone_normalized VARCHAR(32) NULL,
      fixed_otp VARCHAR(6) NULL,
      bypass_enabled TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_app_email (app_target, email_normalized),
      INDEX idx_app_phone (app_target, phone_normalized),
      INDEX idx_app_enabled (app_target, bypass_enabled)
    )
    `
  );

  reviewerTableReady = true;
}

export async function findReviewerByEmail(
  conn: PoolConnection,
  appTarget: "mobile" | "agent",
  email: string
) {
  await ensureReviewerTable(conn);
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return null;

  const [rows] = await conn.query<RowDataPacket[]>(
    `
    SELECT *
    FROM linescout_reviewer_accounts
    WHERE app_target = ?
      AND auth_channel = 'email'
      AND email_normalized = ?
      AND bypass_enabled = 1
    LIMIT 1
    `,
    [appTarget, emailNorm]
  );

  return (rows?.[0] as ReviewerAccount) || null;
}

export async function findReviewerByPhone(
  conn: PoolConnection,
  appTarget: "mobile" | "agent",
  phone: string
) {
  await ensureReviewerTable(conn);
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) return null;

  const [rows] = await conn.query<RowDataPacket[]>(
    `
    SELECT *
    FROM linescout_reviewer_accounts
    WHERE app_target = ?
      AND auth_channel = 'phone'
      AND phone_normalized = ?
      AND bypass_enabled = 1
    LIMIT 1
    `,
    [appTarget, phoneNorm]
  );

  return (rows?.[0] as ReviewerAccount) || null;
}
