// app/api/internal/paid-chat/inbox/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAccess() {
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
      `SELECT
         u.id,
         u.role,
         u.is_active,
         COALESCE(p.can_view_handoffs, 0) AS can_view_handoffs
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    let canViewHandoffs = !!rows[0].can_view_handoffs;
    const approvalStatus = String(rows[0].approval_status || "").toLowerCase();

    if (role === "admin") {
      return { ok: true as const, userId, role };
    }

    if (approvalStatus === "approved" && !canViewHandoffs) {
      await conn.query(
        `
        INSERT INTO internal_user_permissions (user_id, can_view_handoffs, can_view_leads)
        VALUES (?, 1, 1)
        ON DUPLICATE KEY UPDATE
          can_view_handoffs = VALUES(can_view_handoffs),
          can_view_leads = VALUES(can_view_leads)
        `,
        [userId]
      );
      canViewHandoffs = true;
    }

    if (canViewHandoffs) {
      return { ok: true as const, userId, role };
    }

    return {
      ok: false as const,
      status: 403 as const,
      error: "ACCOUNT_APPROVAL_REQUIRED",
      message:
        "Thank you for creating an account. Please go to your profile to complete all required sections. Our account approval team will review and approve your account so you can start claiming projects.",
    };
  } finally {
    conn.release();
  }
}

/**
 * GET /api/internal/paid-chat/inbox?limit=50&cursor=0&kind=paid|quick_human
 * - kind=paid (default): paid inbox (existing behavior)
 * - kind=quick_human: quick human inbox
 */
export async function GET(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, message: (auth as any).message || auth.error },
      { status: auth.status }
    );
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(10, Math.min(200, limitRaw));
  const cursor = Number(url.searchParams.get("cursor") || 0);
  const kind = String(url.searchParams.get("kind") || "paid"); // "paid" | "quick_human"
  const scope = String(url.searchParams.get("scope") || "").toLowerCase(); // "unclaimed" | "mine"

  const conn = await db.getConnection();
  try {
    const params: any[] = [];

    // Base filters + agent restriction
    let where = "";

    if (kind === "quick_human") {
      // Quick human chats: NOT paid, NOT handoffs
      where = `
        c.conversation_kind = 'quick_human'
        AND c.chat_mode = 'limited_human'
        AND c.project_status = 'active'
      `;
    } else {
      // Paid chats: original behavior
      where = `
        c.chat_mode = 'paid_human'
        AND c.payment_status = 'paid'
        AND c.project_status = 'active'
      `;
    }

    if (auth.role !== "admin") {
      if (kind === "paid") {
        const wantMine = scope === "mine";
        const wantUnclaimed = scope === "unclaimed" || !scope;

        if (wantMine) {
          where += ` AND c.assigned_agent_id = ?`;
          params.push(auth.userId);
        } else if (wantUnclaimed) {
          where += ` AND c.assigned_agent_id IS NULL`;
          where += ` AND (h.status IS NULL OR LOWER(h.status) = 'pending')`;
        } else {
          where += ` AND (c.assigned_agent_id = ? OR c.assigned_agent_id IS NULL)`;
          params.push(auth.userId);
        }
      } else {
        where += ` AND (c.assigned_agent_id = ? OR c.assigned_agent_id IS NULL)`;
        params.push(auth.userId);
      }
    }

    if (cursor > 0) {
      where += ` AND c.id < ?`;
      params.push(cursor);
    }

    const [rows]: any = await conn.query(
      `
      SELECT
        c.id AS conversation_id,
        c.id AS id,

        c.user_id,
        c.route_type,
        c.chat_mode,
        c.payment_status,
        c.project_status,
        c.conversation_kind,

        c.assigned_agent_id,
        ia.username AS assigned_agent_username,

        c.updated_at,

        h.id AS handoff_id,
        COALESCE(
          NULLIF(TRIM(u.display_name), ''),
          NULLIF(TRIM(h.customer_name), ''),
          NULLIF(SUBSTRING_INDEX(u.email, '@', 1), ''),
          'Customer'
        ) AS customer_name,
        COALESCE(NULLIF(TRIM(h.email), ''), u.email) AS email,
        h.whatsapp_number,
        h.status AS handoff_status,

        lm.id AS last_message_id,
        lm.sender_type AS last_sender_type,
        lm.message_text AS last_message_text,
        lm.created_at AS last_message_at,

        COALESCE(r.last_seen_message_id, 0) AS last_seen_message_id,

        CASE
          WHEN COALESCE(lm.id, 0) > COALESCE(r.last_seen_message_id, 0)
               AND lm.sender_type = 'user'
            THEN 1
          ELSE 0
        END AS is_unread

      FROM linescout_conversations c
      LEFT JOIN linescout_handoffs h ON h.id = c.handoff_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN internal_users ia ON ia.id = c.assigned_agent_id

      LEFT JOIN linescout_conversation_reads r
        ON r.conversation_id = c.id
       AND r.internal_user_id = ?

      LEFT JOIN (
        SELECT m1.*
        FROM linescout_messages m1
        JOIN (
          SELECT conversation_id, MAX(id) AS max_id
          FROM linescout_messages
          GROUP BY conversation_id
        ) mm ON mm.conversation_id = m1.conversation_id AND mm.max_id = m1.id
      ) lm ON lm.conversation_id = c.id

      WHERE ${where}
      ORDER BY COALESCE(lm.id, 0) DESC, c.updated_at DESC
      LIMIT ?
      `,
      [auth.userId, ...params, limit]
    );

    const nextCursor = rows?.length ? Number(rows[rows.length - 1].conversation_id) : null;

    return NextResponse.json({ ok: true, items: rows || [], next_cursor: nextCursor });
  } catch (e: any) {
    console.error("GET /api/internal/paid-chat/inbox error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load inbox" }, { status: 500 });
  } finally {
    conn.release();
  }
}
