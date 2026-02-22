import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsTable } from "@/lib/white-label-products";

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

function idFrom(ctx: { params: { id: string } }) {
  const raw = ctx?.params?.id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request, ctx: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = idFrom(ctx);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const fields: string[] = [];
  const params: any[] = [];

  function setField(name: string, val: any) {
    fields.push(`${name} = ?`);
    params.push(val);
  }

  if (body?.product_name !== undefined) setField("product_name", clean(body.product_name) || null);
  if (body?.category !== undefined) setField("category", clean(body.category) || null);
  if (body?.short_desc !== undefined) setField("short_desc", clean(body.short_desc) || null);
  if (body?.why_sells !== undefined) setField("why_sells", clean(body.why_sells) || null);
  if (body?.regulatory_note !== undefined)
    setField("regulatory_note", clean(body.regulatory_note) || null);
  if (body?.mockup_prompt !== undefined) setField("mockup_prompt", clean(body.mockup_prompt) || null);
  if (body?.image_url !== undefined) setField("image_url", clean(body.image_url) || null);
  if (body?.fob_low_usd !== undefined) setField("fob_low_usd", toNum(body.fob_low_usd));
  if (body?.fob_high_usd !== undefined) setField("fob_high_usd", toNum(body.fob_high_usd));
  if (body?.cbm_per_1000 !== undefined) setField("cbm_per_1000", toNum(body.cbm_per_1000));
  if (body?.size_template !== undefined) setField("size_template", clean(body.size_template) || null);
  if (body?.volumetric_kg_per_1000 !== undefined)
    setField("volumetric_kg_per_1000", toNum(body.volumetric_kg_per_1000));
  if (body?.amazon_asin !== undefined) setField("amazon_asin", clean(body.amazon_asin) || null);
  if (body?.amazon_url !== undefined) setField("amazon_url", clean(body.amazon_url) || null);
  if (body?.amazon_marketplace !== undefined)
    setField("amazon_marketplace", clean(body.amazon_marketplace).toUpperCase() || null);
  if (body?.amazon_currency !== undefined)
    setField("amazon_currency", clean(body.amazon_currency).toUpperCase() || null);
  if (body?.amazon_price_low !== undefined) setField("amazon_price_low", toNum(body.amazon_price_low));
  if (body?.amazon_price_high !== undefined) setField("amazon_price_high", toNum(body.amazon_price_high));
  if (body?.amazon_last_checked_at !== undefined)
    setField("amazon_last_checked_at", clean(body.amazon_last_checked_at) || null);
  if (body?.is_active !== undefined) setField("is_active", body.is_active ? 1 : 0);
  if (body?.sort_order !== undefined) setField("sort_order", toNum(body.sort_order) ?? 0);

  if (!fields.length) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);

    params.push(id);
    await conn.query(
      `
      UPDATE linescout_white_label_products
      SET ${fields.join(", ")}
      WHERE id = ?
      LIMIT 1
      `,
      params
    );

    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_white_label_products WHERE id = ? LIMIT 1`,
      [id]
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
    console.error("PATCH /api/internal/admin/white-label-products/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update product" }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function DELETE(req: Request, ctx: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = idFrom(ctx);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsTable(conn);
    await conn.query(
      `
      DELETE FROM linescout_white_label_products
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/internal/admin/white-label-products/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to delete product" }, { status: 500 });
  } finally {
    conn.release();
  }
}
