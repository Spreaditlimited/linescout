import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { recomputeWhiteLabelLandedCostsForCountry } from "@/lib/white-label-landed";

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
      `SELECT u.role
       FROM internal_sessions s
       JOIN internal_users u ON u.id = s.user_id
       WHERE s.session_token = ?
         AND s.revoked_at IS NULL
         AND u.is_active = 1
       LIMIT 1`,
      [token]
    );
    if (!rows.length) return { ok: false as const, status: 401 as const, error: "Invalid session" };
    if (rows[0].role !== "admin") return { ok: false as const, status: 403 as const, error: "Forbidden" };
    return { ok: true as const };
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const all = Boolean(body?.all);
  const countryId = Number(body?.country_id || 0);

  const conn = await db.getConnection();
  try {
    if (all) {
      const [rows]: any = await conn.query(
        `
        SELECT DISTINCT c.id
        FROM linescout_countries c
        JOIN linescout_shipping_rates r ON r.country_id = c.id AND r.is_active = 1
        JOIN linescout_shipping_types t ON t.id = r.shipping_type_id
        WHERE c.is_active = 1
          AND LOWER(TRIM(t.name)) IN ('sea','sea shipping')
        `
      );
      const ids = (rows || []).map((r: any) => Number(r.id)).filter((id: number) => id);
      for (const id of ids) {
        await recomputeWhiteLabelLandedCostsForCountry(conn, id);
      }
      return NextResponse.json({ ok: true, count: ids.length });
    }

    if (!countryId) {
      return NextResponse.json({ ok: false, error: "country_id is required" }, { status: 400 });
    }
    await recomputeWhiteLabelLandedCostsForCountry(conn, countryId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to recompute" }, { status: 500 });
  } finally {
    conn.release();
  }
}
