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

async function ensureAddressColumns(conn: any) {
  const columns = [
    { name: "address_line", type: "VARCHAR(255) NULL" },
    { name: "address_district", type: "VARCHAR(255) NULL" },
    { name: "address_province", type: "VARCHAR(255) NULL" },
    { name: "address_postal", type: "VARCHAR(32) NULL" },
  ];
  for (const col of columns) {
    const [rows]: any = await conn.query(
      `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'linescout_agent_profiles'
        AND column_name = ?
      LIMIT 1
      `,
      [col.name]
    );
    if (!rows?.length) {
      await conn.query(
        `ALTER TABLE linescout_agent_profiles ADD COLUMN ${col.name} ${col.type}`
      );
    }
  }
}

export async function POST(req: Request) {
  const auth = await requireInternalSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (auth.role !== "agent") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fullAddress = clean(body?.full_address);
  const addressLine = clean(body?.address_line);
  const addressDistrict = clean(body?.address_district);
  const addressProvince = clean(body?.address_province);
  const addressPostal = clean(body?.address_postal);
  const chinaCity = clean(body?.china_city);
  const country = clean(body?.country || "China");

  const hasStructured = !!addressLine;
  if ((!fullAddress && !hasStructured) || !chinaCity) {
    return NextResponse.json({ ok: false, error: "Address and city are required" }, { status: 400 });
  }

  if (country && country.toLowerCase() !== "china") {
    return NextResponse.json({ ok: false, error: "Address must be in China" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureAddressColumns(conn);
    const pendingPhone = `pending:${auth.userId}`;
    await conn.query(
      `
      INSERT INTO linescout_agent_profiles
        (internal_user_id, first_name, last_name, email, china_phone, china_city, nationality, payout_status)
      SELECT
        u.id,
        COALESCE(u.first_name, ''),
        COALESCE(u.last_name, ''),
        COALESCE(u.email, ''),
        ?,
        'pending',
        'Nigeria',
        'pending'
      FROM internal_users u
      WHERE u.id = ?
      ON DUPLICATE KEY UPDATE internal_user_id = internal_user_id
      `,
      [pendingPhone, auth.userId]
    );

    const finalFull =
      fullAddress ||
      [addressLine, addressDistrict, chinaCity, addressProvince, addressPostal, "China"]
        .filter(Boolean)
        .join(", ");

    await conn.query(
      `
      UPDATE linescout_agent_profiles
      SET full_address = ?,
          china_city = ?,
          address_line = ?,
          address_district = ?,
          address_province = ?,
          address_postal = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE internal_user_id = ?
      LIMIT 1
      `,
      [
        finalFull,
        chinaCity,
        addressLine || null,
        addressDistrict || null,
        addressProvince || null,
        addressPostal || null,
        auth.userId,
      ]
    );

    return NextResponse.json({ ok: true });
  } finally {
    conn.release();
  }
}
