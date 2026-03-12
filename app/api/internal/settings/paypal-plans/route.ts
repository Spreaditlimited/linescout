import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mysql from "mysql2/promise";
import { paypalCreateProduct, paypalCreatePlan, paypalGetPlan } from "@/lib/paypal";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function requireAdmin() {
  const cookieName = process.env.INTERNAL_AUTH_COOKIE_NAME;
  if (!cookieName) {
    return { ok: false as const, status: 500 as const, error: "Missing INTERNAL_AUTH_COOKIE_NAME" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return { ok: false as const, status: 401 as const, error: "Not signed in" };

  const conn = await pool.getConnection();
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

function asMoney(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

function countriesToCurrencies(raw: any): Set<"GBP" | "CAD" | "USD"> {
  const out = new Set<"GBP" | "CAD" | "USD">();
  const parts = String(raw || "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .map((code) => (code === "UK" ? "GB" : code));
  for (const code of parts) {
    if (code === "GB") out.add("GBP");
    if (code === "CA") out.add("CAD");
    if (code === "US") out.add("USD");
  }
  if (!out.size) {
    out.add("GBP");
    out.add("CAD");
    out.add("USD");
  }
  return out;
}

function asFixed2(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

async function planMatches(params: {
  planId: string;
  currency: "GBP" | "CAD" | "USD";
  price: string;
  interval: "MONTH" | "YEAR";
}) {
  try {
    const plan: any = await paypalGetPlan(params.planId);
    const cycle = Array.isArray(plan?.billing_cycles)
      ? plan.billing_cycles.find((c: any) => String(c?.tenure_type || "").toUpperCase() === "REGULAR")
      : null;
    const price = asFixed2(cycle?.pricing_scheme?.fixed_price?.value);
    const currency = String(cycle?.pricing_scheme?.fixed_price?.currency_code || "").toUpperCase();
    const interval = String(cycle?.frequency?.interval_unit || "").toUpperCase();
    return (
      price === asFixed2(params.price) &&
      currency === params.currency &&
      interval === params.interval
    );
  } catch {
    return false;
  }
}

async function ensurePlan(params: {
  enabled: boolean;
  existingPlanId: string | null;
  forceRecreate: boolean;
  productId: string;
  name: string;
  currency: "GBP" | "CAD" | "USD";
  price: string;
  interval: "MONTH" | "YEAR";
}) {
  if (!params.enabled) {
    return params.existingPlanId ? String(params.existingPlanId).trim() || null : null;
  }
  const existing = params.existingPlanId ? String(params.existingPlanId).trim() : "";
  if (!params.forceRecreate && existing) {
    const matches = await planMatches({
      planId: existing,
      currency: params.currency,
      price: params.price,
      interval: params.interval,
    });
    if (matches) return existing;
  }
  const created = await paypalCreatePlan({
    productId: params.productId,
    name: params.name,
    currency: params.currency,
    price: params.price,
    interval: params.interval,
    intervalCount: 1,
  });
  return created.id;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const productName = String(body?.product_name || "LineScout White Label Ideas").trim();
  const forceRecreate = Boolean(body?.force_recreate);

  const conn = await pool.getConnection();
  try {
    await ensureWhiteLabelSettings(conn);
    const [rows]: any = await conn.query(
      `SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1`
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: "Settings not found." }, { status: 500 });
    }

    const monthlyGbp = asMoney(row.white_label_monthly_price_gbp);
    const yearlyGbp = asMoney(row.white_label_yearly_price_gbp);
    const monthlyCad = asMoney(row.white_label_monthly_price_cad);
    const yearlyCad = asMoney(row.white_label_yearly_price_cad);
    const monthlyUsd = asMoney(row.white_label_monthly_price_usd);
    const yearlyUsd = asMoney(row.white_label_yearly_price_usd);

    const enabledCurrencies = countriesToCurrencies(row.white_label_subscription_countries);
    const missing: string[] = [];
    if (enabledCurrencies.has("GBP") && !monthlyGbp) missing.push("GBP monthly");
    if (enabledCurrencies.has("GBP") && !yearlyGbp) missing.push("GBP yearly");
    if (enabledCurrencies.has("CAD") && !monthlyCad) missing.push("CAD monthly");
    if (enabledCurrencies.has("CAD") && !yearlyCad) missing.push("CAD yearly");
    if (enabledCurrencies.has("USD") && !monthlyUsd) missing.push("USD monthly");
    if (enabledCurrencies.has("USD") && !yearlyUsd) missing.push("USD yearly");
    if (missing.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Set required white-label prices before creating PayPal plans: ${missing.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    let productId = String(row.white_label_paypal_product_id || "").trim();
    if (!productId) {
      const product = await paypalCreateProduct({
        name: productName,
        description: "Access to LineScout white label ideas and Amazon comparison.",
      });
      productId = product.id;
    }

    const monthlyGbpId = await ensurePlan({
      enabled: enabledCurrencies.has("GBP"),
      existingPlanId: row.white_label_paypal_plan_monthly_gbp || null,
      forceRecreate,
      productId,
      name: "White Label Monthly (GBP)",
      currency: "GBP",
      price: monthlyGbp!,
      interval: "MONTH",
    });
    const yearlyGbpId = await ensurePlan({
      enabled: enabledCurrencies.has("GBP"),
      existingPlanId: row.white_label_paypal_plan_yearly_gbp || null,
      forceRecreate,
      productId,
      name: "White Label Yearly (GBP)",
      currency: "GBP",
      price: yearlyGbp!,
      interval: "YEAR",
    });
    const monthlyCadId = await ensurePlan({
      enabled: enabledCurrencies.has("CAD"),
      existingPlanId: row.white_label_paypal_plan_monthly_cad || null,
      forceRecreate,
      productId,
      name: "White Label Monthly (CAD)",
      currency: "CAD",
      price: monthlyCad!,
      interval: "MONTH",
    });
    const yearlyCadId = await ensurePlan({
      enabled: enabledCurrencies.has("CAD"),
      existingPlanId: row.white_label_paypal_plan_yearly_cad || null,
      forceRecreate,
      productId,
      name: "White Label Yearly (CAD)",
      currency: "CAD",
      price: yearlyCad!,
      interval: "YEAR",
    });
    const monthlyUsdId = await ensurePlan({
      enabled: enabledCurrencies.has("USD"),
      existingPlanId: row.white_label_paypal_plan_monthly_usd || null,
      forceRecreate,
      productId,
      name: "White Label Monthly (USD)",
      currency: "USD",
      price: monthlyUsd!,
      interval: "MONTH",
    });
    const yearlyUsdId = await ensurePlan({
      enabled: enabledCurrencies.has("USD"),
      existingPlanId: row.white_label_paypal_plan_yearly_usd || null,
      forceRecreate,
      productId,
      name: "White Label Yearly (USD)",
      currency: "USD",
      price: yearlyUsd!,
      interval: "YEAR",
    });

    await conn.query(
      `UPDATE linescout_settings
       SET white_label_paypal_product_id = ?,
           white_label_paypal_plan_monthly_gbp = ?,
           white_label_paypal_plan_yearly_gbp = ?,
           white_label_paypal_plan_monthly_cad = ?,
           white_label_paypal_plan_yearly_cad = ?,
           white_label_paypal_plan_monthly_usd = ?,
           white_label_paypal_plan_yearly_usd = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [productId, monthlyGbpId, yearlyGbpId, monthlyCadId, yearlyCadId, monthlyUsdId, yearlyUsdId, row.id]
    );

    return NextResponse.json({
      ok: true,
      force_recreate: forceRecreate,
      product_id: productId,
      plans: {
        monthly_gbp: monthlyGbpId,
        yearly_gbp: yearlyGbpId,
        monthly_cad: monthlyCadId,
        yearly_cad: yearlyCadId,
        monthly_usd: monthlyUsdId,
        yearly_usd: yearlyUsdId,
      },
    });
  } catch (e: any) {
    console.error("POST /api/internal/settings/paypal-plans error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to create PayPal plans" }, { status: 500 });
  } finally {
    conn.release();
  }
}
