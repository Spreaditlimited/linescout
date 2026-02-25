import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const qRaw = String(url.searchParams.get("q") || "").trim();
  const q = qRaw.replace(/\s+/g, " ");
  if (q.length < 2) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const num = Number(q);

  const conn = await db.getConnection();
  try {
    const params: any[] = [like, like];
    let idFilter = "";
    if (Number.isFinite(num) && num > 0) {
      idFilter = " OR u.id = ? ";
      params.push(num);
    }

    const [rows]: any = await conn.query(
      `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.display_currency_code,
        c.payment_provider,
        (
          SELECT h.whatsapp_number
          FROM linescout_handoffs h
          WHERE h.email = u.email
            AND h.whatsapp_number IS NOT NULL
            AND h.whatsapp_number <> ''
          ORDER BY h.id DESC
          LIMIT 1
        ) AS whatsapp_number,
        (
          SELECT h.customer_name
          FROM linescout_handoffs h
          WHERE h.email = u.email
            AND h.customer_name IS NOT NULL
            AND h.customer_name <> ''
          ORDER BY h.id DESC
          LIMIT 1
        ) AS customer_name
      FROM users u
      LEFT JOIN linescout_countries c ON c.id = u.country_id
      WHERE (u.email LIKE ? OR u.display_name LIKE ? ${idFilter})
      ORDER BY u.id DESC
      LIMIT 25
      `,
      params
    );

    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}
