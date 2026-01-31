import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
}

function toKobo(amountNgn: any) {
  const n = Number(amountNgn);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.round(n * 100);
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

    return { ok: true as const, userId: Number(rows[0].id), role: String(rows[0].role || "") };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // For now: only agents can request payout
  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const amountNgn = body?.amount_ngn;
  const requestedNote = clean(body?.requested_note);

  const amountKobo = toKobo(amountNgn);

  // Basic validation (adjust later)
  if (amountKobo < 100 * 100) {
    return NextResponse.json(
      { ok: false, error: "Minimum payout request is ₦100" },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    // Must have a VERIFIED payout account on file
    const [acctRows]: any = await conn.query(
      `
      SELECT id, status, verified_at
      FROM linescout_agent_payout_accounts
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [auth.userId]
    );

    if (!acctRows?.length) {
      return NextResponse.json(
        { ok: false, error: "Add and verify your payout bank account first." },
        { status: 400 }
      );
    }

    const acct = acctRows[0];
    const acctVerified = String(acct.status || "") === "verified" || !!acct.verified_at;

    if (!acctVerified) {
      return NextResponse.json(
        { ok: false, error: "Your payout bank account is not verified yet." },
        { status: 400 }
      );
    }

    const [ins]: any = await conn.query(
      `
      INSERT INTO linescout_agent_payout_requests
        (internal_user_id, amount_kobo, currency, status, requested_note, requested_at, created_at, updated_at)
      VALUES
        (?, ?, 'NGN', 'pending', ?, NOW(), NOW(), NOW())
      `,
      [auth.userId, amountKobo, requestedNote || null]
    );

    const requestId = Number(ins?.insertId || 0);

    return NextResponse.json({
      ok: true,
      payout_request_id: requestId,
      amount_kobo: amountKobo,
      status: "pending",
    });
  } catch (e: any) {
    const msg = String(e?.message || "Failed to create payout request");
    console.error("POST /api/internal/agents/payout-requests/create error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}