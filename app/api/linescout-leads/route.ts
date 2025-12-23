import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return { ok: false as const, status: 401 as const, error: "Not signed in" };
  }

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.role
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return { ok: false as const, status: 401 as const, error: "Invalid session" };
    }

    if (rows[0].role !== "admin") {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

// Public: lead capture from website
export async function POST(req: Request) {
  const conn = await pool.getConnection();
  try {
    const body = await req.json().catch(() => ({}));

    const { sessionId, name, whatsapp, email, sourcingRequest, meta = {} } = body || {};

    if (!sessionId || !name || !whatsapp || !email || !sourcingRequest) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    await conn.execute(
      `
      INSERT INTO linescout_leads
      (session_id, name, whatsapp, email, sourcing_request, meta_json)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        String(name).trim(),
        String(whatsapp).trim(),
        String(email).trim(),
        String(sourcingRequest).trim(),
        JSON.stringify(meta),
      ]
    );

    const n8nUrl =
      process.env.N8N_LEAD_WEBHOOK_URL ||
      "https://n8n.sureimports.com/webhook/webhook/linescout_lead_capture";

    // IMPORTANT: In production/serverless, fire-and-forget fetch can be dropped.
    // We await it with a short timeout so the request actually leaves the server.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const resp = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: String(name).trim(),
          whatsapp: String(whatsapp).trim(),
          email: String(email).trim(),
          sourcingRequest: String(sourcingRequest).trim(),
          meta,
        }),
        signal: controller.signal,
      });

      // Optional: log non-2xx responses for debugging
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.error("n8n lead webhook non-2xx:", resp.status, t);
      }
    } catch (err) {
      console.error("n8n lead webhook failed:", err);
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("linescout lead insert error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save lead" }, { status: 500 });
  } finally {
    conn.release();
  }
}

// Admin-only: list leads
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const url = new URL(req.url);
    const pageRaw = url.searchParams.get("page") || "1";
    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [countRows]: any = await conn.query(`SELECT COUNT(*) AS total FROM linescout_leads`);
    const total = Number(countRows?.[0]?.total || 0);

    const [rows]: any = await conn.query(
      `
      SELECT
        id,
        created_at,
        name,
        email,
        whatsapp,
        sourcing_request,
        status,
        claimed_by,
        call_summary,
        called_at,
        called_by
      FROM linescout_leads
      ORDER BY created_at DESC
      LIMIT ?, ?
      `,
      [offset, PAGE_SIZE]
    );

    return NextResponse.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows,
    });
  } catch (err: any) {
    console.error("GET /api/linescout-leads error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch leads", details: err?.message || String(err) },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

// Admin-only: update lead status
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body || {};

    // CLAIM
    if (action === "claim") {
      const { leadId } = body || {};
      if (!leadId) {
        return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });
      }

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'claimed'
        WHERE id = ?
          AND status = 'new'
          AND claimed_by IS NULL
        `,
        [Number(leadId)]
      );

      if (!result || result.affectedRows !== 1) {
        return NextResponse.json(
          { ok: false, error: "Lead cannot be claimed (already claimed or not new)." },
          { status: 409 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // MARK CALLED
    if (action === "called") {
      const { leadId, callSummary } = body || {};
      if (!leadId) {
        return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });
      }

      const summary = String(callSummary || "").trim();
      if (!summary) {
        return NextResponse.json({ ok: false, error: "callSummary is required" }, { status: 400 });
      }

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'called',
            called_at = NOW(),
            call_summary = ?
        WHERE id = ?
          AND status IN ('claimed','new')
        `,
        [summary, Number(leadId)]
      );

      if (!result || result.affectedRows !== 1) {
        return NextResponse.json(
          { ok: false, error: "Lead could not be updated to called." },
          { status: 409 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action. Use action=claim or action=called." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("PATCH /api/linescout-leads error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update lead", details: err?.message || String(err) },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}