import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureAgentPointsTable } from "@/lib/agent-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWindow(raw: string | null) {
  const key = String(raw || "all").trim();
  if (key === "30" || key === "60" || key === "90") return { window: key as "30" | "60" | "90", days: Number(key) };
  return { window: "all" as const, days: null as number | null };
}

function parseTestEmails(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      return raw
        .split(/[\n,]/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return [];
}

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
      SELECT
        u.id,
        u.role,
        u.is_active,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
      FROM internal_sessions s
      JOIN internal_users u ON u.id = s.user_id
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      WHERE s.session_token = ?
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (!rows[0].is_active) return { ok: false as const, status: 403 as const, error: "Account disabled" };

    const role = String(rows[0].role || "");
    const canView = role === "admin" ? true : !!rows[0].can_view_handoffs;
    if (!canView) return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const { window, days } = normalizeWindow(url.searchParams.get("window"));
  const dateFilter = days ? "AND h.created_at >= (NOW() - INTERVAL ? DAY)" : "";
  const dateParams = days ? [days] : [];
  const excludeTest = url.searchParams.get("exclude_test") === "1";

  const conn = await db.getConnection();
  try {
    let testEmails: string[] = [];
    if (excludeTest) {
      try {
        const [settingsRows]: any = await conn.query(
          `SELECT test_emails_json FROM linescout_settings ORDER BY id DESC LIMIT 1`
        );
        testEmails = parseTestEmails(settingsRows?.[0]?.test_emails_json);
      } catch {
        testEmails = [];
      }
    }
    const emailPlaceholders =
      excludeTest && testEmails.length ? testEmails.map(() => "?").join(",") : "";
    const emailFilter =
      excludeTest && testEmails.length
        ? `
      AND (h.email IS NULL OR LOWER(TRIM(h.email)) NOT IN (${emailPlaceholders}))
      AND (u.email IS NULL OR LOWER(TRIM(u.email)) NOT IN (${emailPlaceholders}))
    `
        : "";
    const baseWhere = `
      WHERE 1=1
      ${dateFilter}
      ${emailFilter}
    `;
    const baseParams =
      excludeTest && testEmails.length
        ? [...dateParams, ...testEmails, ...testEmails]
        : dateParams;

    const [totalsRows]: any = await conn.query(
      `
      SELECT
        COUNT(*) AS total_projects,
        SUM(CASE WHEN LOWER(h.status) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN LOWER(h.status) IN ('delivered','resolved') THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN LOWER(h.status) NOT IN ('delivered','resolved','cancelled') THEN 1 ELSE 0 END) AS active,

        SUM(CASE WHEN LOWER(h.status) = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN LOWER(h.status) = 'claimed' THEN 1 ELSE 0 END) AS claimed,
        SUM(CASE WHEN LOWER(h.status) = 'manufacturer_found' THEN 1 ELSE 0 END) AS manufacturer_found,
        SUM(CASE WHEN LOWER(h.status) = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN LOWER(h.status) = 'shipped' THEN 1 ELSE 0 END) AS shipped,
        SUM(CASE WHEN LOWER(h.status) = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN LOWER(h.status) = 'resolved' THEN 1 ELSE 0 END) AS resolved
      FROM linescout_handoffs h
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN users u ON u.id = c.user_id
      ${baseWhere}
      `,
      baseParams
    );
    const totals = totalsRows?.[0] || {};

    const [avgRows]: any = await conn.query(
      `
      SELECT
        AVG(
          CASE
            WHEN h.created_at IS NOT NULL
              AND h.claimed_at IS NOT NULL
              AND h.claimed_at >= h.created_at
            THEN TIMESTAMPDIFF(SECOND, h.created_at, h.claimed_at)
            ELSE NULL
          END
        ) AS pending_to_claimed_sec,
        AVG(
          CASE
            WHEN h.claimed_at IS NOT NULL
              AND h.manufacturer_found_at IS NOT NULL
              AND h.manufacturer_found_at >= h.claimed_at
            THEN TIMESTAMPDIFF(SECOND, h.claimed_at, h.manufacturer_found_at)
            ELSE NULL
          END
        ) AS claimed_to_manufacturer_found_sec,
        AVG(
          CASE
            WHEN h.manufacturer_found_at IS NOT NULL
              AND h.paid_at IS NOT NULL
              AND h.paid_at >= h.manufacturer_found_at
            THEN TIMESTAMPDIFF(SECOND, h.manufacturer_found_at, h.paid_at)
            ELSE NULL
          END
        ) AS manufacturer_found_to_paid_sec,
        AVG(
          CASE
            WHEN h.paid_at IS NOT NULL
              AND h.shipped_at IS NOT NULL
              AND h.shipped_at >= h.paid_at
            THEN TIMESTAMPDIFF(SECOND, h.paid_at, h.shipped_at)
            ELSE NULL
          END
        ) AS paid_to_shipped_sec,
        AVG(
          CASE
            WHEN h.shipped_at IS NOT NULL
              AND h.delivered_at IS NOT NULL
              AND h.delivered_at >= h.shipped_at
            THEN TIMESTAMPDIFF(SECOND, h.shipped_at, h.delivered_at)
            ELSE NULL
          END
        ) AS shipped_to_delivered_sec
      FROM linescout_handoffs h
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN users u ON u.id = c.user_id
      ${baseWhere}
      `,
      baseParams
    );
    const avg = avgRows?.[0] || {};

    const [alertRows]: any = await conn.query(
      `
      SELECT
        SUM(
          CASE
            WHEN LOWER(h.status) = 'pending'
              AND h.claimed_at IS NULL
              AND h.created_at <= (NOW() - INTERVAL 24 HOUR)
            THEN 1 ELSE 0 END
        ) AS unclaimed_over_24h,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'claimed'
              AND h.manufacturer_found_at IS NULL
              AND h.claimed_at IS NOT NULL
              AND h.claimed_at <= (NOW() - INTERVAL 96 HOUR)
            THEN 1 ELSE 0 END
        ) AS manufacturer_over_96h,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'paid'
              AND h.shipped_at IS NULL
              AND h.paid_at IS NOT NULL
              AND h.paid_at <= (NOW() - INTERVAL 21 DAY)
            THEN 1 ELSE 0 END
        ) AS paid_not_shipped_over_21d,

        SUM(
          CASE
            WHEN LOWER(h.status) = 'pending'
              AND h.created_at <= (NOW() - INTERVAL 24 HOUR)
            THEN 1 ELSE 0 END
        ) AS stuck_pending,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'claimed'
              AND h.claimed_at IS NOT NULL
              AND h.claimed_at <= (NOW() - INTERVAL 72 HOUR)
            THEN 1 ELSE 0 END
        ) AS stuck_claimed,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'manufacturer_found'
              AND h.manufacturer_found_at IS NOT NULL
              AND h.manufacturer_found_at <= (NOW() - INTERVAL 72 HOUR)
            THEN 1 ELSE 0 END
        ) AS stuck_manufacturer_found,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'paid'
              AND h.paid_at IS NOT NULL
              AND h.paid_at <= (NOW() - INTERVAL 21 DAY)
            THEN 1 ELSE 0 END
        ) AS stuck_paid,
        SUM(
          CASE
            WHEN LOWER(h.status) = 'shipped'
              AND h.shipped_at IS NOT NULL
              AND h.shipped_at <= (NOW() - INTERVAL 30 DAY)
            THEN 1 ELSE 0 END
        ) AS stuck_shipped
      FROM linescout_handoffs h
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN users u ON u.id = c.user_id
      ${baseWhere}
      `,
      baseParams
    );
    const alerts = alertRows?.[0] || {};

    await ensureAgentPointsTable(conn as any);
    const [agentRows]: any = await conn.query(
      `
      SELECT
        p.agent_id,
        COALESCE(
          NULLIF(MAX(CONCAT(ap.first_name, ' ', ap.last_name)), ' '),
          NULLIF(MAX(ap.first_name), ''),
          NULLIF(MAX(ap.last_name), ''),
          NULLIF(MAX(u.username), ''),
          CONCAT('Agent #', p.agent_id)
        ) AS agent_name,
        COALESCE(SUM(p.points), 0) AS total_points,
        COALESCE(COUNT(*), 0) AS projects_scored
      FROM linescout_agent_points p
      LEFT JOIN internal_users u ON u.id = p.agent_id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = p.agent_id
      LEFT JOIN linescout_handoffs h ON h.id = p.handoff_id
      LEFT JOIN linescout_conversations c ON c.handoff_id = h.id
      LEFT JOIN users cu ON cu.id = c.user_id
      WHERE 1=1
      ${dateFilter}
      ${excludeTest && testEmails.length ? `
      AND (h.email IS NULL OR LOWER(TRIM(h.email)) NOT IN (${emailPlaceholders}))
      AND (cu.email IS NULL OR LOWER(TRIM(cu.email)) NOT IN (${emailPlaceholders}))
      ` : ""}
      GROUP BY p.agent_id
      ORDER BY total_points DESC
      LIMIT 5
      `,
      excludeTest && testEmails.length
        ? [...dateParams, ...testEmails, ...testEmails]
        : dateParams
    );

    const toHours = (sec: any) => {
      const n = Number(sec);
      return Number.isFinite(n) ? Number((n / 3600).toFixed(2)) : null;
    };

    return NextResponse.json({
      ok: true,
      window,
      as_of: new Date().toISOString(),
      totals: {
        projects: num(totals.total_projects),
        cancelled: num(totals.cancelled),
        active: num(totals.active),
        completed: num(totals.completed),
      },
      status_counts: {
        pending: num(totals.pending),
        claimed: num(totals.claimed),
        manufacturer_found: num(totals.manufacturer_found),
        paid: num(totals.paid),
        shipped: num(totals.shipped),
        delivered: num(totals.delivered),
        resolved: num(totals.resolved),
        cancelled: num(totals.cancelled),
      },
      avg_stage_hours: {
        pending_to_claimed: toHours(avg.pending_to_claimed_sec),
        claimed_to_manufacturer_found: toHours(avg.claimed_to_manufacturer_found_sec),
        manufacturer_found_to_paid: toHours(avg.manufacturer_found_to_paid_sec),
        paid_to_shipped: toHours(avg.paid_to_shipped_sec),
        shipped_to_delivered: toHours(avg.shipped_to_delivered_sec),
      },
      sla_alerts: {
        unclaimed_over_24h: num(alerts.unclaimed_over_24h),
        manufacturer_over_96h: num(alerts.manufacturer_over_96h),
        paid_not_shipped_over_21d: num(alerts.paid_not_shipped_over_21d),
      },
      stuck_counts: {
        pending: num(alerts.stuck_pending),
        claimed: num(alerts.stuck_claimed),
        manufacturer_found: num(alerts.stuck_manufacturer_found),
        paid: num(alerts.stuck_paid),
        shipped: num(alerts.stuck_shipped),
      },
      agent_points_top: (agentRows || []).map((r: any) => ({
        agent_id: num(r.agent_id),
        agent_name: String(r.agent_name || `Agent #${num(r.agent_id)}`),
        total_points: num(r.total_points),
        projects_scored: num(r.projects_scored),
      })),
    });
  } finally {
    conn.release();
  }
}
