// app/api/internal/paid-chat/unclaim/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInternalAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Missing INTERNAL_AUTH_COOKIE_NAME",
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
         u.username,
         u.role,
         u.is_active,
         COALESCE(p.can_view_leads, 0) AS can_view_leads
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       LEFT JOIN internal_user_permissions p ON p.user_id = u.id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) {
      return { ok: false as const, status: 401 as const, error: "Invalid session" };
    }

    const userId = Number(rows[0].id);
    const username = String(rows[0].username || "");
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) {
      return { ok: true as const, userId, username, role };
    }

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  } finally {
    conn.release();
  }
}

/**
 * POST /api/internal/paid-chat/unclaim
 * body: { conversation_id: number }
 */
export async function POST(req: Request) {
  const auth = await requireInternalAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const conversationId = Number(body?.conversation_id || 0);

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_id is required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `SELECT id, assigned_agent_id, handoff_id, project_status
       FROM linescout_conversations
       WHERE id = ?
       LIMIT 1`,
      [conversationId]
    );

    if (!rows?.length) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const conv = rows[0];
    const assigned = conv.assigned_agent_id == null ? null : Number(conv.assigned_agent_id);
    const handoffId = conv.handoff_id == null ? null : Number(conv.handoff_id);

    if (!assigned) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "Project is not assigned." }, { status: 400 });
    }

    if (auth.role !== "admin" && assigned !== auth.userId) {
      await conn.rollback();
      return NextResponse.json({ ok: false, error: "You can only release your own projects." }, { status: 403 });
    }

    if (handoffId) {
      const [hrows]: any = await conn.query(
        `SELECT status FROM linescout_handoffs WHERE id = ? LIMIT 1`,
        [handoffId]
      );
      const status = String(hrows?.[0]?.status || "pending").trim().toLowerCase();
      if (!["pending", "manufacturer_found", ""].includes(status)) {
        await conn.rollback();
        return NextResponse.json(
          { ok: false, error: "You can only release projects that are pending or manufacturer found." },
          { status: 403 }
        );
      }

      const [payRows]: any = await conn.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN qp.purpose IN ('product_balance','full_product_payment') AND qp.status = 'paid' THEN qp.amount ELSE 0 END), 0) AS product_paid,
          COALESCE(SUM(CASE WHEN qp.purpose = 'shipping_payment' AND qp.status = 'paid' THEN qp.amount ELSE 0 END), 0) AS shipping_paid
        FROM linescout_quotes q
        JOIN linescout_quote_payments qp ON qp.quote_id = q.id
        WHERE q.handoff_id = ?
        `,
        [handoffId]
      );
      const productPaid = Number(payRows?.[0]?.product_paid || 0);
      const shippingPaid = Number(payRows?.[0]?.shipping_paid || 0);
      if (productPaid > 0 || shippingPaid > 0) {
        await conn.rollback();
        return NextResponse.json(
          {
            ok: false,
            error:
              "Cannot release this project because product or shipping payment has already started.",
          },
          { status: 403 }
        );
      }

      // Record audit before releasing
      await conn.query(
        `
        INSERT INTO linescout_handoff_release_audits
          (handoff_id, conversation_id, released_by_id, released_by_name, released_by_role,
           previous_status, product_paid, shipping_paid, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          handoffId,
          conversationId,
          auth.userId,
          auth.username || null,
          auth.role || null,
          status || null,
          productPaid,
          shippingPaid,
        ]
      );
    }

    await conn.query(
      `UPDATE linescout_conversations
       SET assigned_agent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_agent_id = ?`,
      [conversationId, assigned]
    );

    if (handoffId) {
      await conn.query(
        `
        UPDATE linescout_handoffs
        SET status = 'pending',
            claimed_by = NULL,
            claimed_at = NULL
        WHERE id = ?
          AND (status = 'pending' OR status = 'manufacturer_found' OR status IS NULL)
        `,
        [handoffId]
      );
    }

    await conn.commit();
    return NextResponse.json({ ok: true, conversation_id: conversationId, released: true });
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {}
    console.error("POST /api/internal/paid-chat/unclaim error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to release project" }, { status: 500 });
  } finally {
    conn.release();
  }
}
