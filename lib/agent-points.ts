import type mysql from "mysql2/promise";

type ScoreBreakdown = {
  claim_hours: number | null;
  manufacturer_hours: number | null;
  ship_hours: number | null;
  response_avg_minutes: number | null;
  points: {
    claim: number;
    manufacturer: number;
    ship: number;
    response: number;
    total: number;
  };
};

function hoursBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (1000 * 60 * 60);
}

function minutesBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, ms / (1000 * 60));
}

function scoreByThresholds(valueHours: number | null, thresholds: Array<{ max: number; points: number }>) {
  if (valueHours == null) return 0;
  for (const t of thresholds) {
    if (valueHours <= t.max) return t.points;
  }
  return 0;
}

function scoreByMinutes(valueMinutes: number | null, thresholds: Array<{ max: number; points: number }>) {
  if (valueMinutes == null) return 0;
  for (const t of thresholds) {
    if (valueMinutes <= t.max) return t.points;
  }
  return 0;
}

export async function ensureAgentPointsTable(conn: mysql.Connection) {
  await conn.execute(
    `
    CREATE TABLE IF NOT EXISTS linescout_agent_points (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      agent_id BIGINT UNSIGNED NOT NULL,
      handoff_id BIGINT UNSIGNED NOT NULL,
      conversation_id BIGINT UNSIGNED NULL,
      points INT NOT NULL DEFAULT 0,
      reward_ngn BIGINT UNSIGNED NOT NULL DEFAULT 0,
      breakdown_json JSON NULL,
      response_avg_minutes DECIMAL(10,2) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_handoff (handoff_id),
      KEY idx_agent_id (agent_id),
      KEY idx_conversation_id (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
  );
}

export async function computeAgentPointsForHandoff(conn: mysql.Connection, handoffId: number) {
  if (!handoffId) return null;

  await ensureAgentPointsTable(conn);

  const [existing]: any = await conn.execute(
    `SELECT id FROM linescout_agent_points WHERE handoff_id = ? LIMIT 1`,
    [handoffId]
  );
  if (existing?.length) return { ok: true, skipped: true, reason: "already_scored" };

  const [rows]: any = await conn.execute(
    `
    SELECT h.id, h.created_at, h.claimed_at, h.manufacturer_found_at, h.paid_at, h.shipped_at, h.delivered_at,
           c.id AS conversation_id, c.assigned_agent_id
    FROM linescout_handoffs h
    LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
    WHERE h.id = ?
    LIMIT 1
    `,
    [handoffId]
  );
  const h = rows?.[0];
  if (!h?.id) return null;
  const agentId = Number(h.assigned_agent_id || 0);
  if (!agentId) return { ok: true, skipped: true, reason: "no_assigned_agent" };

  const createdAt = h.created_at ? new Date(h.created_at) : null;
  const claimedAt = h.claimed_at ? new Date(h.claimed_at) : null;
  const manufacturerAt = h.manufacturer_found_at ? new Date(h.manufacturer_found_at) : null;
  const paidAt = h.paid_at ? new Date(h.paid_at) : null;
  const shippedAt = h.shipped_at ? new Date(h.shipped_at) : null;
  const deliveredAt = h.delivered_at ? new Date(h.delivered_at) : null;

  const claimHours = hoursBetween(createdAt, claimedAt);
  const manufacturerHours = hoursBetween(claimedAt, manufacturerAt);
  const shipHours = hoursBetween(paidAt, shippedAt);

  // Response time: average minutes from user message to next agent reply.
  let responseAvgMinutes: number | null = null;
  if (h.conversation_id && deliveredAt) {
    const windowStart = paidAt || createdAt || null;
    const windowEnd = shippedAt || deliveredAt;
    const windowStartIso = windowStart ? windowStart.toISOString().slice(0, 19).replace("T", " ") : null;
    const windowEndIso = windowEnd.toISOString().slice(0, 19).replace("T", " ");

    const [msgRows]: any = await conn.execute(
      `
      SELECT sender_type, created_at
      FROM linescout_messages
      WHERE conversation_id = ?
        ${windowStartIso ? "AND created_at >= ?" : ""}
        AND created_at <= ?
      ORDER BY created_at ASC
      `,
      windowStartIso ? [Number(h.conversation_id), windowStartIso, windowEndIso] : [Number(h.conversation_id), windowEndIso]
    );

    const msgs = Array.isArray(msgRows) ? msgRows : [];
    let pendingUserAt: Date | null = null;
    const deltas: number[] = [];

    for (const m of msgs) {
      const sender = String(m.sender_type || "").trim().toLowerCase();
      const ts = m.created_at ? new Date(m.created_at) : null;
      if (!ts) continue;
      if (sender === "user") {
        if (!pendingUserAt) pendingUserAt = ts;
      } else if (sender === "agent" && pendingUserAt) {
        deltas.push(minutesBetween(pendingUserAt, ts));
        pendingUserAt = null;
      }
    }

    if (deltas.length) {
      const sum = deltas.reduce((a, b) => a + b, 0);
      responseAvgMinutes = Number((sum / deltas.length).toFixed(2));
    }
  }

  try {
    await conn.execute(
      `
      ALTER TABLE linescout_settings
        ADD COLUMN IF NOT EXISTS points_value_ngn BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS points_config_json JSON NULL
      `
    );
  } catch {
    // ignore
  }

  const [settingsRows]: any = await conn.execute(
    `SELECT points_value_ngn, points_config_json FROM linescout_settings ORDER BY id DESC LIMIT 1`
  );
  const pointsValueNgn = Number(settingsRows?.[0]?.points_value_ngn || 0);
  const cfgRaw = settingsRows?.[0]?.points_config_json;
  const cfg =
    cfgRaw && typeof cfgRaw === "object"
      ? cfgRaw
      : typeof cfgRaw === "string"
      ? (() => {
          try {
            return JSON.parse(cfgRaw);
          } catch {
            return null;
          }
        })()
      : null;

  const pointsClaim = scoreByThresholds(claimHours, cfg?.claim_hours || [
    { max: 2, points: 15 },
    { max: 6, points: 12 },
    { max: 24, points: 8 },
    { max: 72, points: 4 },
  ]);

  const pointsManufacturer = scoreByThresholds(manufacturerHours, cfg?.manufacturer_hours || [
    { max: 24, points: 20 },
    { max: 48, points: 16 },
    { max: 96, points: 10 },
    { max: 168, points: 5 },
  ]);

  const pointsShip = scoreByThresholds(shipHours, (cfg?.ship_days || [
    { max: 14, points: 20 },
    { max: 21, points: 14 },
    { max: 28, points: 8 },
  ]).map((t: any) => ({ max: Number(t.max) * 24, points: Number(t.points) })));

  const pointsResponse = scoreByMinutes(responseAvgMinutes, cfg?.response_minutes || [
    { max: 30, points: 30 },
    { max: 120, points: 24 },
    { max: 360, points: 18 },
    { max: 1440, points: 10 },
  ]);

  const totalPoints = pointsClaim + pointsManufacturer + pointsShip + pointsResponse;
  const rewardNgn = Math.max(0, Math.round(totalPoints * (Number.isFinite(pointsValueNgn) ? pointsValueNgn : 0)));

  const breakdown: ScoreBreakdown = {
    claim_hours: claimHours,
    manufacturer_hours: manufacturerHours,
    ship_hours: shipHours,
    response_avg_minutes: responseAvgMinutes,
    points: {
      claim: pointsClaim,
      manufacturer: pointsManufacturer,
      ship: pointsShip,
      response: pointsResponse,
      total: totalPoints,
    },
  };

  await conn.execute(
    `
    INSERT INTO linescout_agent_points
      (agent_id, handoff_id, conversation_id, points, reward_ngn, breakdown_json, response_avg_minutes)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      agentId,
      handoffId,
      Number(h.conversation_id || 0) || null,
      totalPoints,
      rewardNgn,
      JSON.stringify(breakdown),
      responseAvgMinutes != null ? responseAvgMinutes : null,
    ]
  );

  return { ok: true, points: totalPoints, reward_ngn: rewardNgn, breakdown };
}

export async function getAgentPointsSummary(conn: mysql.Connection, agentId: number) {
  const [rows]: any = await conn.execute(
    `
    SELECT
      COALESCE(SUM(points), 0) AS total_points,
      COALESCE(SUM(reward_ngn), 0) AS total_reward_ngn,
      COALESCE(COUNT(*), 0) AS projects_scored
    FROM linescout_agent_points
    WHERE agent_id = ?
    `,
    [agentId]
  );
  const row = rows?.[0] || {};
  return {
    total_points: Number(row.total_points || 0),
    total_reward_ngn: Number(row.total_reward_ngn || 0),
    projects_scored: Number(row.projects_scored || 0),
  };
}
