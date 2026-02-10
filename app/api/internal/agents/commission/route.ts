import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getAgentEarningsSnapshot } from "@/lib/agent-earnings";
import { getAgentPointsSummary } from "@/lib/agent-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalSession() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const h = await headers();
  const bearer = h.get("authorization") || "";
  const headerToken = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const cookieHeader = h.get("cookie") || "";
  const cookieToken =
    cookieHeader
      .split(/[;,]/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";

  const token = headerToken || cookieToken;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT u.id, u.role, u.is_active
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    if (role !== "admin" && role !== "agent") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }

    return { ok: true as const, userId: Number(rows[0].id), role };
  } finally {
    conn.release();
  }
}

async function ensureSettings(conn: any) {
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

  const [rows]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  if (rows?.length) return rows[0];

  await conn.query(
    `INSERT INTO linescout_settings
     (commitment_due_ngn, agent_percent, agent_commitment_percent, markup_percent, exchange_rate_usd, exchange_rate_rmb, points_value_ngn)
     VALUES (0, 5, 40, 20, 0, 0, 0)`
  );
  const [after]: any = await conn.query("SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1");
  return after?.[0] || null;
}

export async function GET() {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await db.getConnection();
  try {
    const settings = await ensureSettings(conn);
    const earnings =
      auth.role === "agent" ? await getAgentEarningsSnapshot(conn, auth.userId) : null;
    const points =
      auth.role === "agent" ? await getAgentPointsSummary(conn, auth.userId) : null;
    const pointsValue = Number(settings?.points_value_ngn || 0);
    const pointsReward =
      points ? Math.max(0, Number((points.total_points * pointsValue).toFixed(2))) : 0;

    return NextResponse.json({
      ok: true,
      commission: {
        agent_percent: Number(settings?.agent_percent || 0),
        agent_commitment_percent: Number(settings?.agent_commitment_percent || 0),
        points_value_ngn: pointsValue,
      },
      earnings,
      points: points
        ? {
            ...points,
            total_reward_ngn: pointsReward,
          }
        : null,
    });
  } finally {
    conn.release();
  }
}
