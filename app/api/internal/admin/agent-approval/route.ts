import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function requireAdminSession() {
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
    if (String(rows[0].role || "") !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/admin/agent-approval?page=1&page_size=25
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const page = Math.max(1, num(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, num(url.searchParams.get("page_size"), 25)));
  const offset = (page - 1) * pageSize;

  const conn = await db.getConnection();
  try {
    const [totalRows]: any = await conn.query(`SELECT COUNT(*) AS total FROM linescout_agent_profiles`);
    const total = Number(totalRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT
        ap.id AS agent_profile_id,
        ap.internal_user_id,

        iu.username,
        iu.role,
        iu.is_active,

        ap.first_name,
        ap.last_name,
        ap.email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,

        ap.nin,
        ap.nin_verified_at,
        ap.full_address,

        ap.approval_status,
        ap.approved_at,
        ap.approved_by_internal_user_id,

        EXISTS(
          SELECT 1
          FROM linescout_agent_payout_accounts pa
          WHERE pa.internal_user_id = ap.internal_user_id
          LIMIT 1
        ) AS has_bank_account,

        ap.created_at,
        ap.updated_at
      FROM linescout_agent_profiles ap
      JOIN internal_users iu ON iu.id = ap.internal_user_id
      ORDER BY ap.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    return NextResponse.json({
      ok: true,
      page,
      page_size: pageSize,
      total,
      items: rows || [],
    });
  } catch (e: any) {
    console.error("GET /api/internal/admin/agent-approval error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load agents" }, { status: 500 });
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/admin/agent-approval
 * body: { internal_user_id: number, action: "approve" | "block" | "pending" }
 */
export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const internalUserId = Number(body?.internal_user_id);
  const action = String(body?.action || "").toLowerCase();

  if (!Number.isFinite(internalUserId) || internalUserId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid internal_user_id" }, { status: 400 });
  }
  if (!["approve", "block", "pending"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Pull profile readiness fields + bank existence
    const [pRows]: any = await conn.query(
      `
      SELECT
        ap.id,
        ap.internal_user_id,
        ap.china_phone_verified_at,
        ap.nin,
        ap.nin_verified_at,
        ap.full_address,
        EXISTS(
          SELECT 1
          FROM linescout_agent_payout_accounts pa
          WHERE pa.internal_user_id = ap.internal_user_id
          LIMIT 1
        ) AS has_bank_account
      FROM linescout_agent_profiles ap
      WHERE ap.internal_user_id = ?
      LIMIT 1
      `,
      [internalUserId]
    );

    if (!pRows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Agent profile not found" }, { status: 404 });
    }

    const p = pRows[0];

    const phoneOk = !!p.china_phone_verified_at;
    const ninProvided = !!(p.nin && String(p.nin).trim());
    const ninOk = !!p.nin_verified_at;
    const addressOk = !!(p.full_address && String(p.full_address).trim());
    const bankOk = !!p.has_bank_account;

    const ready = phoneOk && ninProvided && ninOk && addressOk && bankOk;

    if (action === "approve" && !ready) {
      await conn.rollback();
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cannot approve agent. Missing readiness requirements (phone verify, NIN provided + verified, address, bank).",
        },
        { status: 400 }
      );
    }

    if (action === "approve") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'approved',
            approved_at = NOW(),
            approved_by_internal_user_id = ?
        WHERE internal_user_id = ?
        `,
        [auth.adminId, internalUserId]
      );
    }

    if (action === "block") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'blocked',
            approved_at = NULL,
            approved_by_internal_user_id = NULL
        WHERE internal_user_id = ?
        `,
        [internalUserId]
      );
    }

    if (action === "pending") {
      await conn.query(
        `
        UPDATE linescout_agent_profiles
        SET approval_status = 'pending',
            approved_at = NULL,
            approved_by_internal_user_id = NULL
        WHERE internal_user_id = ?
        `,
        [internalUserId]
      );
    }

    await conn.commit();

    // Return updated row for UI patching
    const [rows]: any = await conn.query(
      `
      SELECT
        ap.id AS agent_profile_id,
        ap.internal_user_id,

        iu.username,
        iu.role,
        iu.is_active,

        ap.first_name,
        ap.last_name,
        ap.email,
        ap.china_phone,
        ap.china_phone_verified_at,
        ap.china_city,
        ap.nationality,

        ap.nin,
        ap.nin_verified_at,
        ap.full_address,

        ap.approval_status,
        ap.approved_at,
        ap.approved_by_internal_user_id,

        EXISTS(
          SELECT 1
          FROM linescout_agent_payout_accounts pa
          WHERE pa.internal_user_id = ap.internal_user_id
          LIMIT 1
        ) AS has_bank_account,

        ap.created_at,
        ap.updated_at
      FROM linescout_agent_profiles ap
      JOIN internal_users iu ON iu.id = ap.internal_user_id
      WHERE ap.internal_user_id = ?
      LIMIT 1
      `,
      [internalUserId]
    );

    return NextResponse.json({ ok: true, item: rows?.[0] || null });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/admin/agent-approval error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update agent" }, { status: 500 });
  } finally {
    conn.release();
  }
}