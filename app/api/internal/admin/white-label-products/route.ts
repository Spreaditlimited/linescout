import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsTable,
} from "@/lib/white-label-products";

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
    if (String(rows[0].role || "") !== "admin")
      return { ok: false as const, status: 403 as const, error: "Forbidden" };

    return { ok: true as const, adminId: Number(rows[0].id) };
  } finally {
    conn.release();
  }
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function toNum(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q")).toLowerCase();
  const category = clean(url.searchParams.get("category"));
  const active = clean(url.searchParams.get("active"));
  const image = clean(url.searchParams.get("image"));

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);

    const clauses: string[] = [];
    const params: any[] = [];

    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }

    if (active === "0" || active === "1") {
      clauses.push("is_active = ?");
      params.push(active === "1" ? 1 : 0);
    }

    if (image === "with") {
      clauses.push("COALESCE(image_url, '') <> ''");
    } else if (image === "missing") {
      clauses.push("COALESCE(image_url, '') = ''");
    }

    if (q) {
      const like = `%${q}%`;
      clauses.push(
        `(LOWER(product_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ?)`
      );
      params.push(like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_white_label_products
      ${where}
      ORDER BY id DESC
      LIMIT 500
      `,
      params
    );

    const items = (rows || []).map((r: any) => ({
      ...r,
      ...computeLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_1000: r.cbm_per_1000,
      }),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("GET /api/internal/admin/white-label-products error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to load products" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));

  const product_name = clean(body?.product_name);
  const category = clean(body?.category);

  if (!product_name) {
    return NextResponse.json({ ok: false, error: "Product name is required" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ ok: false, error: "Category is required" }, { status: 400 });
  }

  const payload = {
    short_desc: clean(body?.short_desc) || null,
    why_sells: clean(body?.why_sells) || null,
    regulatory_note: clean(body?.regulatory_note) || null,
    mockup_prompt: clean(body?.mockup_prompt) || null,
    image_url: clean(body?.image_url) || null,
    fob_low_usd: toNum(body?.fob_low_usd),
    fob_high_usd: toNum(body?.fob_high_usd),
    cbm_per_1000: toNum(body?.cbm_per_1000),
    size_template: clean(body?.size_template) || null,
    volumetric_kg_per_1000: toNum(body?.volumetric_kg_per_1000),
    is_active: body?.is_active === false || body?.is_active === 0 ? 0 : 1,
    sort_order: Number.isFinite(Number(body?.sort_order)) ? Number(body?.sort_order) : 0,
  };

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);

    const [ins]: any = await conn.query(
      `
      INSERT INTO linescout_white_label_products
        (product_name, category, short_desc, why_sells, regulatory_note, mockup_prompt, image_url,
         fob_low_usd, fob_high_usd, cbm_per_1000, size_template, volumetric_kg_per_1000, is_active, sort_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        product_name,
        category,
        payload.short_desc,
        payload.why_sells,
        payload.regulatory_note,
        payload.mockup_prompt,
        payload.image_url,
        payload.fob_low_usd,
        payload.fob_high_usd,
        payload.cbm_per_1000,
        payload.size_template,
        payload.volumetric_kg_per_1000,
        payload.is_active,
        payload.sort_order,
      ]
    );

    const newId = Number(ins?.insertId || 0);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_white_label_products WHERE id = ? LIMIT 1`,
      [newId]
    );
    const item = rows?.[0]
      ? {
          ...rows[0],
          ...computeLandedRange({
            fob_low_usd: rows[0].fob_low_usd,
            fob_high_usd: rows[0].fob_high_usd,
            cbm_per_1000: rows[0].cbm_per_1000,
          }),
        }
      : null;

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    console.error("POST /api/internal/admin/white-label-products error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to create product" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: any) => Number.isFinite(v)) : [];
  const isActive = body?.is_active;

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Missing ids" }, { status: 400 });
  }
  if (typeof isActive !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing is_active" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);

    const placeholders = ids.map(() => "?").join(", ");
    const params = [isActive ? 1 : 0, ...ids];
    const [res]: any = await conn.query(
      `
      UPDATE linescout_white_label_products
      SET is_active = ?
      WHERE id IN (${placeholders})
      `,
      params
    );

    return NextResponse.json({ ok: true, updated: res?.affectedRows || 0 });
  } catch (e: any) {
    console.error("PATCH /api/internal/admin/white-label-products error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update products" }, { status: 500 });
  } finally {
    conn.release();
  }
}
