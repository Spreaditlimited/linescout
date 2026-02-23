import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mysql from "mysql2/promise";
import { paypalCreateProduct, paypalCreatePlan } from "@/lib/paypal";
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

function asMoney(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : fallback.toFixed(2);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const productName = String(body?.product_name || "LineScout White Label Ideas").trim();

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

    const monthlyGbp = asMoney(row.white_label_monthly_price_gbp, 29);
    const yearlyGbp = asMoney(row.white_label_yearly_price_gbp, 299);
    const monthlyCad = asMoney(row.white_label_monthly_price_cad, 49);
    const yearlyCad = asMoney(row.white_label_yearly_price_cad, 499);

    let productId = String(row.white_label_paypal_product_id || "").trim();
    if (!productId) {
      const product = await paypalCreateProduct({
        name: productName,
        description: "Access to LineScout white label ideas and Amazon comparison.",
      });
      productId = product.id;
    }

    const monthlyGbpId =
      row.white_label_paypal_plan_monthly_gbp ||
      (await paypalCreatePlan({
        productId,
        name: "White Label Monthly (GBP)",
        currency: "GBP",
        price: monthlyGbp,
        interval: "MONTH",
        intervalCount: 1,
      })).id;

    const yearlyGbpId =
      row.white_label_paypal_plan_yearly_gbp ||
      (await paypalCreatePlan({
        productId,
        name: "White Label Yearly (GBP)",
        currency: "GBP",
        price: yearlyGbp,
        interval: "YEAR",
        intervalCount: 1,
      })).id;

    const monthlyCadId =
      row.white_label_paypal_plan_monthly_cad ||
      (await paypalCreatePlan({
        productId,
        name: "White Label Monthly (CAD)",
        currency: "CAD",
        price: monthlyCad,
        interval: "MONTH",
        intervalCount: 1,
      })).id;

    const yearlyCadId =
      row.white_label_paypal_plan_yearly_cad ||
      (await paypalCreatePlan({
        productId,
        name: "White Label Yearly (CAD)",
        currency: "CAD",
        price: yearlyCad,
        interval: "YEAR",
        intervalCount: 1,
      })).id;

    await conn.query(
      `UPDATE linescout_settings
       SET white_label_paypal_product_id = ?,
           white_label_paypal_plan_monthly_gbp = ?,
           white_label_paypal_plan_yearly_gbp = ?,
           white_label_paypal_plan_monthly_cad = ?,
           white_label_paypal_plan_yearly_cad = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [productId, monthlyGbpId, yearlyGbpId, monthlyCadId, yearlyCadId, row.id]
    );

    return NextResponse.json({
      ok: true,
      product_id: productId,
      plans: {
        monthly_gbp: monthlyGbpId,
        yearly_gbp: yearlyGbpId,
        monthly_cad: monthlyCadId,
        yearly_cad: yearlyCadId,
      },
    });
  } catch (e: any) {
    console.error("POST /api/internal/settings/paypal-plans error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Failed to create PayPal plans" }, { status: 500 });
  } finally {
    conn.release();
  }
}
