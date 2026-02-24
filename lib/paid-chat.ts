import type { PoolConnection } from "mysql2/promise";

export async function ensurePaidChatMessageColumns(conn: PoolConnection) {
  const cols = [
    { name: "edited_at", ddl: "ALTER TABLE linescout_messages ADD COLUMN edited_at DATETIME NULL" },
    { name: "deleted_at", ddl: "ALTER TABLE linescout_messages ADD COLUMN deleted_at DATETIME NULL" },
    {
      name: "deleted_by_type",
      ddl: "ALTER TABLE linescout_messages ADD COLUMN deleted_by_type VARCHAR(16) NULL",
    },
    { name: "deleted_by_id", ddl: "ALTER TABLE linescout_messages ADD COLUMN deleted_by_id BIGINT NULL" },
  ];

  for (const col of cols) {
    const [rows]: any = await conn.query(
      `SELECT COUNT(*) AS n\n       FROM INFORMATION_SCHEMA.COLUMNS\n       WHERE TABLE_SCHEMA = DATABASE()\n         AND TABLE_NAME = 'linescout_messages'\n         AND COLUMN_NAME = ?`,
      [col.name]
    );
    const exists = Number(rows?.[0]?.n || 0) > 0;
    if (!exists) await conn.query(col.ddl);
  }
}
