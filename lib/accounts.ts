import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "./db";

type AccountMemberRole = "owner" | "member";

type AccountContext = {
  accountId: number;
  role: AccountMemberRole;
};

let infraReadyPromise: Promise<void> | null = null;
let projectAccessInfraReadyPromise: Promise<void> | null = null;

async function columnExists(
  conn: PoolConnection,
  table: string,
  column: string
): Promise<boolean> {
  const [rows]: any = await conn.query(
    `
    SELECT COUNT(*) AS n
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [table, column]
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

async function tableExists(conn: PoolConnection, table: string): Promise<boolean> {
  const [rows]: any = await conn.query(
    `
    SELECT COUNT(*) AS n
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [table]
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

async function indexExists(
  conn: PoolConnection,
  table: string,
  indexName: string
): Promise<boolean> {
  const [rows]: any = await conn.query(
    `
    SELECT COUNT(*) AS n
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [table, indexName]
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

async function ensureTableColumns(conn: PoolConnection) {
  const columns: Array<{ table: string; column: string; ddl: string; index?: string; indexDdl?: string }> = [
    {
      table: "linescout_conversations",
      column: "account_id",
      ddl: "ALTER TABLE linescout_conversations ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_conversations_account",
      indexDdl: "CREATE INDEX idx_conversations_account ON linescout_conversations(account_id)",
    },
    {
      table: "linescout_handoffs",
      column: "account_id",
      ddl: "ALTER TABLE linescout_handoffs ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_handoffs_account",
      indexDdl: "CREATE INDEX idx_handoffs_account ON linescout_handoffs(account_id)",
    },
    {
      table: "linescout_quotes",
      column: "account_id",
      ddl: "ALTER TABLE linescout_quotes ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_quotes_account",
      indexDdl: "CREATE INDEX idx_quotes_account ON linescout_quotes(account_id)",
    },
    {
      table: "linescout_quote_payments",
      column: "account_id",
      ddl: "ALTER TABLE linescout_quote_payments ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_quote_payments_account",
      indexDdl: "CREATE INDEX idx_quote_payments_account ON linescout_quote_payments(account_id)",
    },
    {
      table: "linescout_wallets",
      column: "account_id",
      ddl: "ALTER TABLE linescout_wallets ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_wallets_account",
      indexDdl: "CREATE INDEX idx_wallets_account ON linescout_wallets(account_id)",
    },
    {
      table: "linescout_virtual_accounts",
      column: "account_id",
      ddl: "ALTER TABLE linescout_virtual_accounts ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_virtual_accounts_account",
      indexDdl: "CREATE INDEX idx_virtual_accounts_account ON linescout_virtual_accounts(account_id)",
    },
    {
      table: "linescout_user_payout_accounts",
      column: "account_id",
      ddl: "ALTER TABLE linescout_user_payout_accounts ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_user_payout_accounts_account",
      indexDdl: "CREATE INDEX idx_user_payout_accounts_account ON linescout_user_payout_accounts(account_id)",
    },
    {
      table: "linescout_user_payout_requests",
      column: "account_id",
      ddl: "ALTER TABLE linescout_user_payout_requests ADD COLUMN account_id BIGINT UNSIGNED NULL",
      index: "idx_user_payout_requests_account",
      indexDdl: "CREATE INDEX idx_user_payout_requests_account ON linescout_user_payout_requests(account_id)",
    },
  ];

  for (const item of columns) {
    const hasTable = await tableExists(conn, item.table);
    if (!hasTable) continue;

    const hasColumn = await columnExists(conn, item.table, item.column);
    if (!hasColumn) {
      await conn.query(item.ddl);
    }

    if (item.index && item.indexDdl) {
      const hasIndex = await indexExists(conn, item.table, item.index);
      if (!hasIndex) {
        await conn.query(item.indexDdl);
      }
    }
  }
}

async function backfillAccountData(conn: PoolConnection) {
  await conn.query(
    `
    INSERT INTO linescout_accounts (owner_user_id, name, created_at, updated_at)
    SELECT
      u.id,
      COALESCE(NULLIF(TRIM(u.display_name), ''), CONCAT('Account ', u.id)),
      NOW(),
      NOW()
    FROM users u
    LEFT JOIN linescout_accounts a ON a.owner_user_id = u.id
    WHERE a.id IS NULL
    `
  );

  await conn.query(
    `
    INSERT INTO linescout_account_members (account_id, user_id, role, status, invited_by_user_id, joined_at, created_at, updated_at)
    SELECT
      a.id,
      a.owner_user_id,
      'owner',
      'active',
      a.owner_user_id,
      NOW(),
      NOW(),
      NOW()
    FROM linescout_accounts a
    LEFT JOIN linescout_account_members m
      ON m.account_id = a.id
     AND m.user_id = a.owner_user_id
    WHERE m.id IS NULL
    `
  );

  if (await tableExists(conn, "linescout_conversations")) {
    await conn.query(
      `
      UPDATE linescout_conversations c
      JOIN linescout_accounts a ON a.owner_user_id = c.user_id
      SET c.account_id = a.id
      WHERE c.account_id IS NULL
      `
    );
  }

  if (
    (await tableExists(conn, "linescout_handoffs")) &&
    (await tableExists(conn, "linescout_conversations"))
  ) {
    await conn.query(
      `
      UPDATE linescout_handoffs h
      JOIN linescout_conversations c ON c.handoff_id = h.id
      SET h.account_id = c.account_id
      WHERE h.account_id IS NULL
        AND c.account_id IS NOT NULL
      `
    );
  }

  if ((await tableExists(conn, "linescout_quotes")) && (await tableExists(conn, "linescout_handoffs"))) {
    await conn.query(
      `
      UPDATE linescout_quotes q
      JOIN linescout_handoffs h ON h.id = q.handoff_id
      SET q.account_id = h.account_id
      WHERE q.account_id IS NULL
        AND h.account_id IS NOT NULL
      `
    );
  }

  if (await tableExists(conn, "linescout_quote_payments")) {
    await conn.query(
      `
      UPDATE linescout_quote_payments qp
      JOIN linescout_accounts a ON a.owner_user_id = qp.user_id
      SET qp.account_id = a.id
      WHERE qp.account_id IS NULL
        AND qp.user_id IS NOT NULL
      `
    );
  }

  if (await tableExists(conn, "linescout_wallets")) {
    await conn.query(
      `
      UPDATE linescout_wallets w
      JOIN linescout_accounts a ON a.owner_user_id = w.owner_id
      SET w.account_id = a.id
      WHERE w.account_id IS NULL
        AND w.owner_type = 'user'
      `
    );
  }

  if (await tableExists(conn, "linescout_virtual_accounts")) {
    await conn.query(
      `
      UPDATE linescout_virtual_accounts va
      JOIN linescout_accounts a ON a.owner_user_id = va.owner_id
      SET va.account_id = a.id
      WHERE va.account_id IS NULL
        AND va.owner_type = 'user'
      `
    );
  }

  if (await tableExists(conn, "linescout_user_payout_accounts")) {
    await conn.query(
      `
      UPDATE linescout_user_payout_accounts pa
      JOIN linescout_accounts a ON a.owner_user_id = pa.user_id
      SET pa.account_id = a.id
      WHERE pa.account_id IS NULL
      `
    );
  }

  if (await tableExists(conn, "linescout_user_payout_requests")) {
    await conn.query(
      `
      UPDATE linescout_user_payout_requests pr
      JOIN linescout_accounts a ON a.owner_user_id = pr.user_id
      SET pr.account_id = a.id
      WHERE pr.account_id IS NULL
      `
    );
  }
}

export async function ensureLinescoutAccountInfra(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_accounts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(160) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_linescout_accounts_owner (owner_user_id),
      KEY idx_linescout_accounts_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_account_members (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      role ENUM('owner','member') NOT NULL DEFAULT 'member',
      status ENUM('active','removed') NOT NULL DEFAULT 'active',
      invited_by_user_id BIGINT UNSIGNED NULL,
      joined_at DATETIME NULL,
      removed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_linescout_account_members_account_user (account_id, user_id),
      KEY idx_linescout_account_members_user (user_id),
      KEY idx_linescout_account_members_account_status (account_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_account_invites (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      email_normalized VARCHAR(255) NOT NULL,
      role ENUM('owner','member') NOT NULL DEFAULT 'member',
      token_hash CHAR(64) NOT NULL,
      invited_by_user_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_linescout_account_invites_account (account_id),
      KEY idx_linescout_account_invites_email (email_normalized),
      KEY idx_linescout_account_invites_expires (expires_at),
      UNIQUE KEY uniq_linescout_account_invites_token_hash (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_account_user_contexts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      active_account_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_linescout_account_user_contexts_user (user_id),
      KEY idx_linescout_account_user_contexts_account (active_account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );

  await ensureTableColumns(conn);
  await backfillAccountData(conn);
  await conn.query(
    `
    INSERT INTO linescout_account_user_contexts (user_id, active_account_id, created_at, updated_at)
    SELECT a.owner_user_id, a.id, NOW(), NOW()
    FROM linescout_accounts a
    LEFT JOIN linescout_account_user_contexts c ON c.user_id = a.owner_user_id
    WHERE c.id IS NULL
    `
  );
}

export async function ensureLinescoutAccountInfraOnce() {
  if (!infraReadyPromise) {
    infraReadyPromise = (async () => {
      const conn = await db.getConnection();
      try {
        await ensureLinescoutAccountInfra(conn);
      } finally {
        conn.release();
      }
    })().catch((err) => {
      infraReadyPromise = null;
      throw err;
    });
  }
  await infraReadyPromise;
}

export async function getAccountContextForUser(
  userId: number
): Promise<AccountContext | null> {
  await ensureLinescoutAccountInfraOnce();

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query<RowDataPacket[]>(
      `
      SELECT m.account_id, m.role
      FROM linescout_account_user_contexts c
      JOIN linescout_account_members m
        ON m.account_id = c.active_account_id
       AND m.user_id = c.user_id
       AND m.status = 'active'
      WHERE c.user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    const selected = rows?.[0];
    if (selected) {
      const role = String(selected.role || "member") === "owner" ? "owner" : "member";
      return { accountId: Number(selected.account_id), role };
    }

    const [fallbackRows]: any = await conn.query<RowDataPacket[]>(
      `
      SELECT m.account_id, m.role
      FROM linescout_account_members m
      WHERE m.user_id = ?
        AND m.status = 'active'
      ORDER BY (m.role = 'owner') DESC, m.id ASC
      LIMIT 1
      `,
      [userId]
    );

    const row = fallbackRows?.[0];
    if (!row) return null;

    const role = String(row.role || "member") === "owner" ? "owner" : "member";
    return { accountId: Number(row.account_id), role };
  } finally {
    conn.release();
  }
}

export async function setActiveAccountForUser(userId: number, accountId: number) {
  await ensureLinescoutAccountInfraOnce();

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT id
      FROM linescout_account_members
      WHERE user_id = ?
        AND account_id = ?
        AND status = 'active'
      LIMIT 1
      `,
      [userId, accountId]
    );
    if (!rows?.length) return false;

    await conn.query(
      `
      INSERT INTO linescout_account_user_contexts (user_id, active_account_id, created_at, updated_at)
      VALUES (?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        active_account_id = VALUES(active_account_id),
        updated_at = NOW()
      `,
      [userId, accountId]
    );
    return true;
  } finally {
    conn.release();
  }
}

export function buildConversationAccessScope(
  alias: string,
  ctx: { accountId: number; userId: number }
) {
  return {
    sql: `(${alias}.account_id = ? OR (${alias}.account_id IS NULL AND ${alias}.user_id = ?))`,
    params: [ctx.accountId, ctx.userId] as number[],
  };
}

export async function ensureLinescoutProjectAccessInfra(conn: PoolConnection) {
  await conn.query(
    `
    CREATE TABLE IF NOT EXISTS linescout_project_account_access (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      conversation_id BIGINT UNSIGNED NOT NULL,
      account_id BIGINT UNSIGNED NOT NULL,
      visibility ENUM('owner_only','team') NOT NULL DEFAULT 'owner_only',
      updated_by_user_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_linescout_project_account_access_conv_account (conversation_id, account_id),
      KEY idx_linescout_project_account_access_account_visibility (account_id, visibility),
      KEY idx_linescout_project_account_access_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
}

export async function ensureLinescoutProjectAccessInfraOnce() {
  if (!projectAccessInfraReadyPromise) {
    projectAccessInfraReadyPromise = (async () => {
      const conn = await db.getConnection();
      try {
        await ensureLinescoutProjectAccessInfra(conn);
      } finally {
        conn.release();
      }
    })().catch((err) => {
      projectAccessInfraReadyPromise = null;
      throw err;
    });
  }
  await projectAccessInfraReadyPromise;
}

export function buildProjectVisibilityScope(
  conversationAlias: string,
  projectAccessAlias: string,
  ctx: { userId: number; accountRole: string }
) {
  if (String(ctx.accountRole || "") === "owner") {
    return {
      sql: "1=1",
      params: [] as number[],
    };
  }

  return {
    sql: `(${conversationAlias}.user_id = ? OR COALESCE(${projectAccessAlias}.visibility, 'owner_only') = 'team')`,
    params: [ctx.userId] as number[],
  };
}
