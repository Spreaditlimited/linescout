import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v ?? "").trim();
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

type PaystackBank = {
  name?: string;
  code?: string;
  active?: boolean;
  is_deleted?: boolean;
};

type BankItem = {
  name: string;
  code: string;
};

async function paystackListBanks() {
  const secret = clean(process.env.PAYSTACK_SECRET_KEY);
  if (!secret) {
    return { ok: false as const, status: 500 as const, error: "Missing PAYSTACK_SECRET_KEY" };
  }

  const banks: BankItem[] = [];
  const seen = new Set<string>();
  let next = "";
  let guard = 0;

  do {
    const qs = new URLSearchParams({
      country: "nigeria",
      perPage: "100",
      use_cursor: "true",
      ...(next ? { next } : {}),
    }).toString();

    const res = await fetch(`https://api.paystack.co/bank?${qs}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const raw = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!res.ok || !json?.status) {
      const msg = String(json?.message || raw || `Paystack list banks failed (${res.status})`);
      return { ok: false as const, status: 502 as const, error: msg };
    }

    const data = Array.isArray(json?.data) ? (json.data as PaystackBank[]) : [];
    for (const row of data) {
      const name = clean(row?.name);
      const code = clean(row?.code);
      if (!name || !code) continue;
      if (row?.active === false) continue;
      if (row?.is_deleted === true) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      banks.push({ name, code });
    }

    const nextCursor = clean(json?.meta?.next);
    if (!nextCursor || nextCursor === next) {
      next = "";
    } else {
      next = nextCursor;
    }

    guard += 1;
    if (guard > 10) break;
  } while (next);

  banks.sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true as const, banks };
}

export async function GET() {
  const auth = await requireInternalSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const list = await paystackListBanks();
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: list.status });

  return NextResponse.json({ ok: true, banks: list.banks });
}
