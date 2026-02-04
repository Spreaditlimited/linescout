// app/api/linescout-leads/route.ts
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

// As agreed
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Your approved template
const WA_TEMPLATE_NAME = "linescout_lead_received";
const WA_LANG_CODE = "en";

function sanitizeTemplateText(s: string) {
  return String(s || "")
    .replace(/[\r\n\t]+/g, " ") // no newlines/tabs
    .replace(/ {5,}/g, "    ") // max 4 consecutive spaces
    .replace(/\s{2,}/g, " ") // collapse other whitespace runs
    .trim();
}

function normalizeToDigitsE164(raw: string) {
  // digits-only E.164
  return String(raw || "").replace(/\D/g, "");
}

async function sendWhatsAppLeadMessage(opts: { to: string; name: string; sourcingRequest: string }) {
  if (!WHATSAPP_PHONE_NUMBER_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  if (!WHATSAPP_ACCESS_TOKEN) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");

  const toDigits = normalizeToDigitsE164(opts.to);
  const nameVar = sanitizeTemplateText(opts.name || "there");
  const requestVar = sanitizeTemplateText(opts.sourcingRequest || "your request");

  const url = `https://graph.facebook.com/v24.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: WA_TEMPLATE_NAME,
      language: { code: WA_LANG_CODE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: nameVar },
            { type: "text", text: requestVar },
          ],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${text}`);

  return { ok: true, raw: text };
}

/**
 * Admin OR (agent with can_view_leads=1)
 * Returns userId + role so we can stamp claimed_by / called_by.
 */
async function requireLeadsAccess() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT
         u.id,
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

    if (!rows.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const userId = Number(rows[0].id);
    const role = String(rows[0].role || "");
    const canViewLeads = !!rows[0].can_view_leads;

    if (role === "admin" || canViewLeads) {
      return { ok: true as const, userId, role };
    }

    return { ok: false as const, status: 403 as const, error: "Forbidden" };
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
        String(sessionId).trim(),
        String(name).trim(),
        String(whatsapp).trim(),
        String(email).trim(),
        String(sourcingRequest).trim(),
        JSON.stringify(meta),
      ]
    );

    // WhatsApp notification intentionally disabled for now.
    // Keep response keys for compatibility with existing clients.
    let waSent = false;
    let waError: string | null = null;
    // try {
    //   await sendWhatsAppLeadMessage({
    //     to: String(whatsapp),
    //     name: String(name),
    //     sourcingRequest: String(sourcingRequest),
    //   });
    //   waSent = true;
    // } catch (err: any) {
    //   waError = err?.message || String(err);
    //   console.error("WhatsApp lead message failed:", waError);
    // }

    return NextResponse.json({ ok: true, waSent, waError });
  } catch (err: any) {
    console.error("linescout lead insert error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save lead" }, { status: 500 });
  } finally {
    conn.release();
  }
}

// Admin OR leads-permitted agent: list leads
export async function GET(req: Request) {
  const auth = await requireLeadsAccess();
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

    return NextResponse.json({ ok: true, page, pageSize: PAGE_SIZE, total, items: rows });
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

// Admin OR leads-permitted agent: update lead status
export async function PATCH(req: Request) {
  const auth = await requireLeadsAccess();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const conn = await pool.getConnection();
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body || {};

    // CLAIM
    if (action === "claim") {
      const { leadId } = body || {};
      if (!leadId) return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'claimed',
            claimed_by = ?
        WHERE id = ?
          AND status = 'new'
          AND claimed_by IS NULL
        `,
        [auth.userId, Number(leadId)]
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
      if (!leadId) return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });

      const summary = String(callSummary || "").trim();
      if (!summary) return NextResponse.json({ ok: false, error: "callSummary is required" }, { status: 400 });

      const [result]: any = await conn.query(
        `
        UPDATE linescout_leads
        SET status = 'called',
            called_at = NOW(),
            call_summary = ?,
            called_by = ?
        WHERE id = ?
          AND status IN ('claimed','new')
        `,
        [summary, auth.userId, Number(leadId)]
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
