import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "paystack" | "providus";
type OwnerType = "user" | "agent";

function normalizeProvider(v: any): Provider | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "paystack" || s === "providus") return s;
  return null;
}

function normalizeOwnerType(v: any): OwnerType | null {
  const s = String(v || "").trim().toLowerCase();
  if (s === "user" || s === "agent") return s;
  return null;
}

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `SELECT u.id, u.role, u.is_active
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );

    if (!rows?.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };

    const role = String(rows[0].role || "");
    if (role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, userId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const ownerType = normalizeOwnerType(url.searchParams.get("owner_type"));
  const q = String(url.searchParams.get("q") || "").trim();
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const conn = await db.getConnection();
  try {
    if (ownerType === "agent") {
      const params: any[] = [];
      let where = "o.owner_type = 'agent'";
      if (q) {
        where += " AND (ap.first_name LIKE ? OR ap.last_name LIKE ? OR ap.email LIKE ? OR iu.username LIKE ?)";
        params.push(like, like, like, like);
      }

      const [rows]: any = await conn.query(
        `SELECT
           o.id,
           o.owner_type,
           o.owner_id,
           o.provider,
           o.created_at,
           o.updated_at,
           iu.username,
           ap.email,
           ap.first_name,
           ap.last_name
         FROM linescout_payment_provider_overrides o
         JOIN internal_users iu ON iu.id = o.owner_id
         LEFT JOIN linescout_agent_profiles ap ON ap.internal_user_id = iu.id
         WHERE ${where}
         ORDER BY o.updated_at DESC`,
        params
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    }

    if (ownerType === "user") {
      const params: any[] = [];
      let where = "o.owner_type = 'user'";
      if (q) {
        where += " AND (u.email LIKE ? OR u.display_name LIKE ?)";
        params.push(like, like);
      }

      const [rows]: any = await conn.query(
        `SELECT
           o.id,
           o.owner_type,
           o.owner_id,
           o.provider,
           o.created_at,
           o.updated_at,
           u.email,
           u.display_name
         FROM linescout_payment_provider_overrides o
         JOIN users u ON u.id = o.owner_id
         WHERE ${where}
         ORDER BY o.updated_at DESC`,
        params
      );

      return NextResponse.json({ ok: true, items: rows || [] });
    }

    const [rows]: any = await conn.query(
      `SELECT id, owner_type, owner_id, provider, created_at, updated_at
       FROM linescout_payment_provider_overrides
       ORDER BY updated_at DESC`
    );
    return NextResponse.json({ ok: true, items: rows || [] });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const ownerType = normalizeOwnerType(body?.owner_type);
  const ownerId = Number(body?.owner_id || 0);
  const provider = normalizeProvider(body?.provider);

  if (!ownerType || !ownerId) {
    return NextResponse.json({ ok: false, error: "owner_type and owner_id are required" }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider must be 'paystack' or 'providus'" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.query(
      `INSERT INTO linescout_payment_provider_overrides
        (owner_type, owner_id, provider, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE provider = VALUES(provider), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [ownerType, ownerId, provider, auth.userId]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const ownerType = normalizeOwnerType(body?.owner_type);
  const ownerId = Number(body?.owner_id || 0);

  if (!ownerType || !ownerId) {
    return NextResponse.json({ ok: false, error: "owner_type and owner_id are required" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.query(
      `DELETE FROM linescout_payment_provider_overrides WHERE owner_type = ? AND owner_id = ?`,
      [ownerType, ownerId]
    );
    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
