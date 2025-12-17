import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function getDbConfig() {
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  };
}

export async function POST(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json();

    const {
      sessionId,
      name,
      whatsapp,
      email,
      sourcingRequest,
      meta = {},
    } = body || {};

    if (!sessionId || !name || !whatsapp || !email || !sourcingRequest) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    conn = await mysql.createConnection(getDbConfig());

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

    fetch(n8nUrl, {
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
    }).catch((err) => {
      console.error("n8n lead webhook failed:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("linescout lead insert error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save lead" },
      { status: 500 }
    );
  } finally {
    try {
      if (conn) await conn.end();
    } catch {}
  }
}

export async function GET(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const url = new URL(req.url);
    const pageRaw = url.searchParams.get("page") || "1";
    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    conn = await mysql.createConnection(getDbConfig());

    // total count
    const [countRows]: any = await conn.query(
      `SELECT COUNT(*) AS total FROM linescout_leads`
    );
    const total = Number(countRows?.[0]?.total || 0);

    // items
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
        call_summary
      FROM linescout_leads
      ORDER BY created_at DESC
      LIMIT ${offset}, ${PAGE_SIZE}
      `
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
      {
        ok: false,
        error: "Failed to fetch leads",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  } finally {
    try {
      if (conn) await conn.end();
    } catch {}
  }
}

export async function PATCH(req: Request) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body || {};

    conn = await mysql.createConnection(getDbConfig());

    // --- CLAIM ---
    if (action === "claim") {
      const { leadId, agentId } = body || {};

      if (!leadId || !agentId) {
        return NextResponse.json(
          { ok: false, error: "leadId and agentId are required" },
          { status: 400 }
        );
      }

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'claimed',
            claimed_by = ?
        WHERE id = ?
          AND status = 'new'
          AND claimed_by IS NULL
        `,
        [Number(agentId), Number(leadId)]
      );

      if (!result || result.affectedRows !== 1) {
        return NextResponse.json(
          { ok: false, error: "Lead cannot be claimed (already claimed or not new)." },
          { status: 409 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // --- MARK CALLED ---
    if (action === "called") {
      const { leadId, agentId, callSummary } = body || {};

      if (!leadId || !agentId) {
        return NextResponse.json(
          { ok: false, error: "leadId and agentId are required" },
          { status: 400 }
        );
      }

      const summary = String(callSummary || "").trim();
      if (!summary) {
        return NextResponse.json(
          { ok: false, error: "callSummary is required" },
          { status: 400 }
        );
      }

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'called',
            called_at = NOW(),
            called_by = ?,
            call_summary = ?
        WHERE id = ?
          AND status IN ('claimed','new')
        `,
        [Number(agentId), summary, Number(leadId)]
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
    try {
      if (conn) await conn.end();
    } catch {}
  }
}