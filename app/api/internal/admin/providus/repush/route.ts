import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getProvidusConfig, normalizeProvidusBaseUrl, providusHeaders } from "@/lib/providus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
       LIMIT 1`,
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

async function ensureAuditTable(conn: any) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS linescout_providus_repush_audits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      internal_user_id BIGINT UNSIGNED NOT NULL,
      settlement_id VARCHAR(64) NULL,
      session_id VARCHAR(64) NULL,
      request_json JSON NULL,
      response_json JSON NULL,
      http_status INT NULL,
      request_ok TINYINT(1) NOT NULL DEFAULT 0,
      error_message VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_created_at (created_at),
      KEY idx_settlement (settlement_id),
      KEY idx_session (session_id),
      KEY idx_internal_user (internal_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const settlementId = String(body?.settlement_id || "").trim();
  const sessionId = String(body?.session_id || "").trim();

  if (!settlementId && !sessionId) {
    return NextResponse.json({ ok: false, error: "settlement_id or session_id is required" }, { status: 400 });
  }

  const cfg = getProvidusConfig();
  if (!cfg.ok) return NextResponse.json({ ok: false, error: cfg.error }, { status: 500 });

  const hdr = providusHeaders();
  if (!hdr.ok) return NextResponse.json({ ok: false, error: hdr.error }, { status: 500 });

  const payload = {
    settlement_id: settlementId,
    session_id: sessionId,
  };

  const url = `${normalizeProvidusBaseUrl(cfg.baseUrl)}/PiP_RepushTransaction_SettlementId`;

  let status = 0;
  let json: any = null;
  let raw = "";
  let ok = false;
  let err = "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: hdr.headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    status = res.status;
    raw = await res.text();
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    ok = !!res.ok && !!json?.requestSuccessful && String(json?.responseCode || "") === "00";
    if (!ok) {
      err = String(json?.responseMessage || raw || `Providus repush failed (${res.status})`).slice(0, 255);
    }
  } catch (e: any) {
    err = String(e?.message || "Providus repush network error").slice(0, 255);
  }

  const conn = await db.getConnection();
  try {
    await ensureAuditTable(conn);
    await conn.query(
      `INSERT INTO linescout_providus_repush_audits
        (internal_user_id, settlement_id, session_id, request_json, response_json, http_status, request_ok, error_message)
       VALUES (?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, ?, ?)`,
      [
        auth.adminId,
        settlementId,
        sessionId,
        JSON.stringify(payload),
        json ? JSON.stringify(json) : JSON.stringify({ raw }),
        status || null,
        ok ? 1 : 0,
        err || null,
      ]
    );
  } finally {
    conn.release();
  }

  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        error: err || "Providus repush failed",
        provider_response: json || (raw ? { raw } : null),
        http_status: status || null,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    provider_response: json,
    http_status: status,
  });
}
