import type { PoolConnection } from "mysql2/promise";

export async function ensureReordersTable(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_reorder_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      conversation_id BIGINT UNSIGNED NOT NULL,
      handoff_id BIGINT UNSIGNED NOT NULL,
      source_conversation_id BIGINT UNSIGNED NULL,
      source_handoff_id BIGINT UNSIGNED NULL,
      new_conversation_id BIGINT UNSIGNED NULL,
      new_handoff_id BIGINT UNSIGNED NULL,
      route_type VARCHAR(32) NOT NULL DEFAULT 'machine_sourcing',
      status VARCHAR(32) NOT NULL DEFAULT 'pending_agent',
      original_agent_id BIGINT UNSIGNED NULL,
      assigned_agent_id BIGINT UNSIGNED NULL,
      user_note TEXT NULL,
      admin_note TEXT NULL,
      paystack_ref VARCHAR(120) NULL,
      amount_ngn BIGINT UNSIGNED NULL,
      paid_at DATETIME NULL,
      assigned_at DATETIME NULL,
      closed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_id (user_id),
      KEY idx_conversation_id (conversation_id),
      KEY idx_handoff_id (handoff_id),
      KEY idx_source_conversation_id (source_conversation_id),
      KEY idx_source_handoff_id (source_handoff_id),
      KEY idx_new_conversation_id (new_conversation_id),
      KEY idx_new_handoff_id (new_handoff_id),
      KEY idx_assigned_agent_id (assigned_agent_id),
      KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );

  // Ensure new columns exist for older installs (MySQL 8+ supports IF NOT EXISTS)
  try {
    await conn.query(
      `
      ALTER TABLE linescout_reorder_requests
        ADD COLUMN IF NOT EXISTS source_conversation_id BIGINT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS source_handoff_id BIGINT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS new_conversation_id BIGINT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS new_handoff_id BIGINT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS paystack_ref VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS amount_ngn BIGINT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS paid_at DATETIME NULL
      `
    );
  } catch {
    // Ignore if ALTER is not supported or columns already exist.
  }
}
