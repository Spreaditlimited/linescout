import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { computeMachineLandedRange, ensureMachinesReady, getMachinePricingSettings } from "@/lib/machines";

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

  if (body?.machine_name !== undefined) setField("machine_name", clean(body.machine_name) || null);
  if (body?.category !== undefined) setField("category", clean(body.category) || null);
  if (body?.processing_stage !== undefined)
    setField("processing_stage", clean(body.processing_stage) || null);
  if (body?.capacity_range !== undefined)
    setField("capacity_range", clean(body.capacity_range) || null);
  if (body?.power_requirement !== undefined)
    setField("power_requirement", clean(body.power_requirement) || null);
  if (body?.short_desc !== undefined) setField("short_desc", clean(body.short_desc) || null);
  if (body?.why_sells !== undefined) setField("why_sells", clean(body.why_sells) || null);
  if (body?.regulatory_note !== undefined)
    setField("regulatory_note", clean(body.regulatory_note) || null);
  if (body?.mockup_prompt !== undefined)
    setField("mockup_prompt", clean(body.mockup_prompt) || null);
  if (body?.image_url !== undefined) setField("image_url", clean(body.image_url) || null);
  if (body?.seo_title !== undefined) setField("seo_title", clean(body.seo_title) || null);
  if (body?.seo_description !== undefined)
    setField("seo_description", clean(body.seo_description) || null);
  if (body?.business_summary !== undefined)
    setField("business_summary", clean(body.business_summary) || null);
  if (body?.market_notes !== undefined) setField("market_notes", clean(body.market_notes) || null);
  if (body?.sourcing_notes !== undefined) setField("sourcing_notes", clean(body.sourcing_notes) || null);
  if (body?.fob_low_usd !== undefined) setField("fob_low_usd", toNum(body.fob_low_usd));
  if (body?.fob_high_usd !== undefined) setField("fob_high_usd", toNum(body.fob_high_usd));
  if (body?.cbm_per_unit !== undefined) setField("cbm_per_unit", toNum(body.cbm_per_unit));
  if (body?.is_active !== undefined) setField("is_active", body.is_active ? 1 : 0);
  if (body?.sort_order !== undefined) setField("sort_order", toNum(body.sort_order) ?? 0);

  if (!fields.length) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await ensureMachinesReady(conn);

    params.push(id);
    await conn.query(
      `
      UPDATE linescout_machines
      SET ${fields.join(", ")}
      WHERE id = ?
      LIMIT 1
      `,
      params
    );

    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_machines WHERE id = ? LIMIT 1`,
      [id]
    );

    const pricing = await getMachinePricingSettings(conn);
    const item = rows?.[0]
      ? {
          ...rows[0],
          ...computeMachineLandedRange({
            fob_low_usd: rows[0].fob_low_usd,
            fob_high_usd: rows[0].fob_high_usd,
            cbm_per_unit: rows[0].cbm_per_unit,
            exchange_rate_usd: pricing.exchange_rate_usd,
            cbm_rate_ngn: pricing.cbm_rate_ngn,
            markup_percent: pricing.markup_percent,
          }),
        }
      : null;

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    console.error("PATCH /api/internal/admin/machines/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to update machine" }, { status: 500 });
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
    await ensureMachinesReady(conn);
    await conn.query(
      `
      DELETE FROM linescout_machines
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/internal/admin/machines/[id] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to delete machine" }, { status: 500 });
  } finally {
    conn.release();
  }
}
