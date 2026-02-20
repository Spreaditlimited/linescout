import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureReordersTable } from "@/lib/reorders";
import { ensureAgentPointsTable } from "@/lib/agent-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeChinaPhone(value: string) {
  const raw = String(value || "").trim().replace(/[\s-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+86")) return raw;
  if (raw.startsWith("86")) return `+${raw}`;
  return raw;
}

function isValidChinaMobile(value: string) {
  return /^\+86(1[3-9]\d{9})$/.test(value);
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function ensurePermissionColumns(conn: any) {
  const [permCols]: any = await conn.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'internal_user_permissions'
      AND column_name = 'claim_limit_override'
    LIMIT 1
    `
  );
  if (!permCols?.length) {
    await conn.query(
      `ALTER TABLE internal_user_permissions ADD COLUMN claim_limit_override INT NULL`
    );
  }
}

async function requireAdmin() {
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
    await ensureReordersTable(conn);
    await ensureAgentPointsTable(conn);
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

function maxPointsFromConfig(cfg: any) {
  const claim = Array.isArray(cfg?.claim_hours) ? cfg.claim_hours : [
    { max: 2, points: 15 },
    { max: 6, points: 12 },
    { max: 24, points: 8 },
    { max: 72, points: 4 },
  ];
  const manufacturer = Array.isArray(cfg?.manufacturer_hours) ? cfg.manufacturer_hours : [
    { max: 24, points: 20 },
    { max: 48, points: 16 },
    { max: 96, points: 10 },
    { max: 168, points: 5 },
  ];
  const ship = Array.isArray(cfg?.ship_days) ? cfg.ship_days : [
    { max: 14, points: 20 },
    { max: 21, points: 14 },
    { max: 28, points: 8 },
  ];
  const response = Array.isArray(cfg?.response_minutes) ? cfg.response_minutes : [
    { max: 30, points: 30 },
    { max: 120, points: 24 },
    { max: 360, points: 18 },
    { max: 1440, points: 10 },
  ];

  const max = (arr: any[]) => arr.reduce((m, r) => Math.max(m, num(r?.points, 0)), 0);
  return {
    claim: max(claim),
    manufacturer: max(manufacturer),
    ship: max(ship),
    response: max(response),
    total: max(claim) + max(manufacturer) + max(ship) + max(response),
  };
}

function verdictFor(points: number, maxPoints: number) {
  if (!maxPoints) return "—";
  const ratio = points / maxPoints;
  if (ratio >= 0.75) return "Excellent";
  if (ratio >= 0.5) return "Average";
  return "Poor";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const agentId = Number(id || 0);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid agent id" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensurePermissionColumns(conn);
    const [agentRows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.username,
        u.email AS user_email,
        u.role,
        u.is_active,
        u.created_at,
        COALESCE(p.can_view_leads, 0) AS can_view_leads,
        COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs,
        COALESCE(p.can_view_analytics, 0) AS can_view_analytics,
        p.claim_limit_override,
        ap.first_name,
        ap.last_name,
        ap.email AS profile_email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,
        ap.nin,
        ap.nin_verified_at,
        ap.full_address,
        ap.approval_status,
        ap.approved_at,
        ap.rejection_reason,
        pa.bank_code,
        pa.account_number,
        pa.account_name,
        pa.status AS bank_status,
        pa.verified_at AS bank_verified_at
      FROM internal_users u
      LEFT JOIN internal_user_permissions p ON p.user_id = u.id
      LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
      LEFT JOIN linescout_agent_payout_accounts pa ON pa.internal_user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [agentId]
    );

    if (!agentRows?.length) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    const a = agentRows[0];
    const chinaPhone = String(a.china_phone || "");
    const phoneVerified =
      !!a.china_phone_verified_at || isValidChinaMobile(normalizeChinaPhone(chinaPhone));

    const ninProvided = !!(a.nin && String(a.nin).trim().length > 0);
    const ninVerified = !!a.nin_verified_at;
    const addressProvided = !!(a.full_address && String(a.full_address).trim().length > 0);
    const bankProvided = !!(a.account_number && String(a.account_number).trim().length > 0);
    const bankVerified = !!a.bank_verified_at || String(a.bank_status || "") === "verified";

    const approvalStatus = String(a.approval_status || "pending");

    const [projects]: any = await conn.query(
      `
      SELECT
        h.id AS handoff_id,
        h.status,
        h.handoff_type,
        h.customer_name,
        h.email,
        h.whatsapp_number,
        h.created_at,
        h.claimed_at,
        h.manufacturer_found_at,
        h.paid_at,
        h.shipped_at,
        h.delivered_at,
        c.id AS conversation_id,
        c.project_status
      FROM linescout_handoffs h
      JOIN linescout_conversations c ON c.handoff_id = h.id
      WHERE c.assigned_agent_id = ?
      ORDER BY h.created_at DESC
      `,
      [agentId]
    );

    const handoffIds = (projects || []).map((p: any) => Number(p.handoff_id)).filter(Boolean);
    const idPlaceholders = handoffIds.length ? handoffIds.map(() => "?").join(",") : null;

    let quoteByHandoff = new Map<number, any>();
    let reorderByHandoff = new Map<number, any>();
    let pointsByHandoff = new Map<number, any>();

    if (handoffIds.length) {
      const [quoteRows]: any = await conn.query(
        `
        SELECT handoff_id, COUNT(*) AS quote_count, MAX(created_at) AS latest_quote_at, MAX(id) AS latest_quote_id
        FROM linescout_quotes
        WHERE handoff_id IN (${idPlaceholders})
        GROUP BY handoff_id
        `,
        handoffIds
      );
      quoteByHandoff = new Map((quoteRows || []).map((r: any) => [Number(r.handoff_id), r]));

      const [reorderRows]: any = await conn.query(
        `
        SELECT handoff_id, COUNT(*) AS reorder_count
        FROM linescout_reorder_requests
        WHERE handoff_id IN (${idPlaceholders})
           OR source_handoff_id IN (${idPlaceholders})
           OR new_handoff_id IN (${idPlaceholders})
        GROUP BY handoff_id
        `,
        [...handoffIds, ...handoffIds, ...handoffIds]
      );
      reorderByHandoff = new Map((reorderRows || []).map((r: any) => [Number(r.handoff_id), r]));

      const [pointsRows]: any = await conn.query(
        `
        SELECT handoff_id, points, reward_ngn, breakdown_json
        FROM linescout_agent_points
        WHERE agent_id = ?
          AND handoff_id IN (${idPlaceholders})
        `,
        [agentId, ...handoffIds]
      );
      pointsByHandoff = new Map((pointsRows || []).map((r: any) => [Number(r.handoff_id), r]));
    }

    const [settingsRows]: any = await conn.query(
      `SELECT points_config_json FROM linescout_settings ORDER BY id DESC LIMIT 1`
    );
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

    const maxPoints = maxPointsFromConfig(cfg);

    const projectItems = (projects || []).map((p: any) => {
      const claimHours =
        p.claimed_at && p.created_at
          ? Math.max(0, (new Date(p.claimed_at).getTime() - new Date(p.created_at).getTime()) / 36e5)
          : null;
      const quotes = quoteByHandoff.get(Number(p.handoff_id)) || null;
      const reorders = reorderByHandoff.get(Number(p.handoff_id)) || null;
      const pts = pointsByHandoff.get(Number(p.handoff_id)) || null;
      const points = pts ? Number(pts.points || 0) : 0;

      return {
        handoff_id: Number(p.handoff_id),
        conversation_id: Number(p.conversation_id || 0) || null,
        status: String(p.status || ""),
        handoff_type: String(p.handoff_type || ""),
        customer_name: String(p.customer_name || ""),
        email: String(p.email || ""),
        whatsapp_number: String(p.whatsapp_number || ""),
        created_at: p.created_at,
        claimed_at: p.claimed_at,
        claim_hours: claimHours != null ? Number(claimHours.toFixed(2)) : null,
        quote_count: quotes ? Number(quotes.quote_count || 0) : 0,
        latest_quote_id: quotes ? Number(quotes.latest_quote_id || 0) : null,
        latest_quote_at: quotes ? quotes.latest_quote_at : null,
        reorder_count: reorders ? Number(reorders.reorder_count || 0) : 0,
        points,
        points_max: maxPoints.total,
        verdict: pts ? verdictFor(points, maxPoints.total) : "Not scored",
      };
    });

    return NextResponse.json({
      ok: true,
      agent: {
        id: Number(a.id),
        username: String(a.username || ""),
        email: String(a.profile_email || a.user_email || ""),
        is_active: !!a.is_active,
        created_at: a.created_at,
        permissions: {
          can_view_leads: !!a.can_view_leads,
          can_view_handoffs: !!a.can_view_handoffs,
          can_view_analytics: !!a.can_view_analytics,
          claim_limit_override: a.claim_limit_override != null ? Number(a.claim_limit_override) : null,
        },
        profile: {
          first_name: a.first_name ? String(a.first_name) : null,
          last_name: a.last_name ? String(a.last_name) : null,
          china_phone: chinaPhone || null,
          china_phone_verified_at: a.china_phone_verified_at,
          china_city: a.china_city ? String(a.china_city) : null,
          nationality: a.nationality ? String(a.nationality) : null,
          nin: a.nin ? String(a.nin) : null,
          nin_verified_at: a.nin_verified_at,
          full_address: a.full_address ? String(a.full_address) : null,
          approval_status: approvalStatus,
          approved_at: a.approved_at,
          rejection_reason: a.rejection_reason,
        },
        payout_account: a.account_number
          ? {
              bank_code: a.bank_code ? String(a.bank_code) : null,
              account_number: String(a.account_number || ""),
              account_name: a.account_name ? String(a.account_name) : null,
              status: a.bank_status ? String(a.bank_status) : "pending",
              verified_at: a.bank_verified_at,
            }
          : null,
        checklist: {
          phone_verified: phoneVerified,
          nin_provided: ninProvided,
          nin_verified: ninVerified,
          bank_provided: bankProvided,
          bank_verified: bankVerified,
          address_provided: addressProvided,
        },
      },
      projects: projectItems,
      points_max: maxPoints,
    });
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const agentId = Number(id || 0);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid agent id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = body?.claim_limit_override;
  const value =
    raw === null || raw === undefined || raw === ""
      ? null
      : Number(raw);

  if (value !== null && (!Number.isFinite(value) || value < 1 || value > 100)) {
    return NextResponse.json(
      { ok: false, error: "Claim limit override must be between 1 and 100." },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await ensurePermissionColumns(conn);

    await conn.query(
      `
      INSERT INTO internal_user_permissions (user_id, claim_limit_override)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE claim_limit_override = VALUES(claim_limit_override)
      `,
      [agentId, value]
    );

    return NextResponse.json({ ok: true, claim_limit_override: value });
  } finally {
    conn.release();
  }
}
