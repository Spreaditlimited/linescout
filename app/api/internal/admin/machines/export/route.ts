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

function escapeCsv(value: any) {
  const str = String(value ?? "");
  if (/[,"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
    await ensureMachinesReady(conn);
    const pricing = await getMachinePricingSettings(conn);

    const clauses: string[] = [];
    const params: any[] = [];

    if (category) {
      clauses.push("m.category = ?");
      params.push(category);
    }

    if (active === "0" || active === "1") {
      clauses.push("m.is_active = ?");
      params.push(active === "1" ? 1 : 0);
    }

    if (image === "with") {
      clauses.push("COALESCE(m.image_url, '') <> ''");
    } else if (image === "missing") {
      clauses.push("COALESCE(m.image_url, '') = ''");
    }

    if (q) {
      const like = `%${q}%`;
      clauses.push(
        `(LOWER(m.machine_name) LIKE ? OR LOWER(m.category) LIKE ? OR LOWER(COALESCE(m.short_desc,'')) LIKE ?)`
      );
      params.push(like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT m.*,
        COALESCE(v.views, 0) AS view_count
      FROM linescout_machines m
      LEFT JOIN (
        SELECT machine_id, COUNT(*) AS views
        FROM linescout_machine_views
        GROUP BY machine_id
      ) v ON v.machine_id = m.id
      ${where}
      ORDER BY m.sort_order ASC, m.id DESC
      `,
      params
    );

    const header = [
      "id",
      "machine_name",
      "category",
      "processing_stage",
      "capacity_range",
      "power_requirement",
      "short_desc",
      "why_sells",
      "regulatory_note",
      "mockup_prompt",
      "image_url",
      "slug",
      "seo_title",
      "seo_description",
      "business_summary",
      "market_notes",
      "sourcing_notes",
      "fob_low_usd",
      "fob_high_usd",
      "cbm_per_unit",
      "is_active",
      "sort_order",
      "view_count",
      "landed_ngn_low",
      "landed_ngn_high",
      "freight_ngn",
      "created_at",
      "updated_at",
    ];

    const lines = [header.join(",")];
    for (const r of rows || []) {
      const pricingRow = computeMachineLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_unit: r.cbm_per_unit,
        exchange_rate_usd: pricing.exchange_rate_usd,
        cbm_rate_ngn: pricing.cbm_rate_ngn,
        markup_percent: pricing.markup_percent,
      });
      const row = [
        r.id,
        r.machine_name,
        r.category,
        r.processing_stage,
        r.capacity_range,
        r.power_requirement,
        r.short_desc,
        r.why_sells,
        r.regulatory_note,
        r.mockup_prompt,
        r.image_url,
        r.slug,
        r.seo_title,
        r.seo_description,
        r.business_summary,
        r.market_notes,
        r.sourcing_notes,
        r.fob_low_usd,
        r.fob_high_usd,
        r.cbm_per_unit,
        r.is_active,
        r.sort_order,
        r.view_count ?? 0,
        pricingRow.landed_ngn_low,
        pricingRow.landed_ngn_high,
        pricingRow.freight_ngn,
        r.created_at,
        r.updated_at,
      ].map(escapeCsv);
      lines.push(row.join(","));
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=machines.csv",
      },
    });
  } catch (e: any) {
    console.error("GET /api/internal/admin/machines/export error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to export machines" }, { status: 500 });
  } finally {
    conn.release();
  }
}
