import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paypalCreateSubscription } from "@/lib/paypal";
import { ensureCountryConfig, ensureUserCountryColumns, backfillUserDefaults } from "@/lib/country-config";
import { ensureWhiteLabelSettings, ensureWhiteLabelUserColumns } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BillingPeriod = "monthly" | "yearly";
type BillingCurrency = "GBP" | "CAD" | "USD";

function isValidPeriod(v: any): v is BillingPeriod {
  return v === "monthly" || v === "yearly";
}

function safeCallbackUrl(req: Request, raw: any) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && url.origin === origin) return url.toString();
    if (host && url.host === host) return url.toString();
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any)?.id || 0);

    const body = await req.json().catch(() => ({}));
    const period = body?.period;
    if (!isValidPeriod(period)) {
      return NextResponse.json({ ok: false, error: "Invalid period" }, { status: 400 });
    }

    const callbackUrl = safeCallbackUrl(req, body?.callback_url);
    if (!callbackUrl) {
      return NextResponse.json({ ok: false, error: "Invalid callback_url" }, { status: 400 });
    }

    const conn = await db.getConnection();
    let planId: string | null = null;
    try {
      await ensureCountryConfig(conn);
      await ensureUserCountryColumns(conn);
      await backfillUserDefaults(conn);
      await ensureWhiteLabelSettings(conn);
      await ensureWhiteLabelUserColumns(conn);

      const [[row]]: any = await conn.query(
        `
        SELECT u.display_currency_code, c.settlement_currency_code, c.iso2, c.amazon_enabled,
               s.white_label_subscription_countries,
               s.white_label_paypal_plan_monthly_gbp,
               s.white_label_paypal_plan_yearly_gbp,
               s.white_label_paypal_plan_monthly_cad,
               s.white_label_paypal_plan_yearly_cad,
               s.white_label_paypal_plan_monthly_usd,
               s.white_label_paypal_plan_yearly_usd
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        CROSS JOIN (SELECT * FROM linescout_settings ORDER BY id DESC LIMIT 1) s
        WHERE u.id = ?
        LIMIT 1
        `,
        [userId]
      );

      const settlement = String(row?.settlement_currency_code || "").toUpperCase();
      const display = String(row?.display_currency_code || settlement || "").toUpperCase();
      const iso2Raw = String(row?.iso2 || "").trim().toUpperCase();
      const iso2 = iso2Raw === "UK" ? "GB" : iso2Raw;
      const amazonEnabled = Number(row?.amazon_enabled || 0) === 1;
      const allowedCountries = String(row?.white_label_subscription_countries || "")
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean)
        .map((code) => (code === "UK" ? "GB" : code));
      const countryAllowed = !allowedCountries.length || (iso2 ? allowedCountries.includes(iso2) : false);
      if (!amazonEnabled || !countryAllowed) {
        return NextResponse.json(
          { ok: false, error: "White-label subscription is not enabled for your country." },
          { status: 400 }
        );
      }

      const currency: BillingCurrency =
        display === "CAD" || iso2 === "CA"
          ? "CAD"
          : display === "USD" || iso2 === "US"
          ? "USD"
          : "GBP";

      if (currency === "CAD") {
        planId =
          period === "monthly"
            ? String(row?.white_label_paypal_plan_monthly_cad || "")
            : String(row?.white_label_paypal_plan_yearly_cad || "");
      } else if (currency === "USD") {
        planId =
          period === "monthly"
            ? String(row?.white_label_paypal_plan_monthly_usd || "")
            : String(row?.white_label_paypal_plan_yearly_usd || "");
      } else {
        planId =
          period === "monthly"
            ? String(row?.white_label_paypal_plan_monthly_gbp || "")
            : String(row?.white_label_paypal_plan_yearly_gbp || "");
      }
      planId = planId?.trim() || null;
    } finally {
      conn.release();
    }

    if (!planId) {
      return NextResponse.json(
        { ok: false, error: "Subscription plan is not configured." },
        { status: 500 }
      );
    }

    const returnUrl = `${callbackUrl}&status=success`;
    const cancelUrl = `${callbackUrl}&status=cancel`;
    const customId = `LS_USER_${userId}`;
    const subscription = await paypalCreateSubscription({
      planId,
      returnUrl,
      cancelUrl,
      customId,
    });

    if (!subscription.approveUrl) {
      return NextResponse.json(
        { ok: false, error: "PayPal approval URL missing." },
        { status: 500 }
      );
    }

    const nextBillingAt = (subscription as any)?.raw?.billing_info?.next_billing_time || null;
    const saveConn = await db.getConnection();
    try {
      await ensureWhiteLabelUserColumns(saveConn);
      await saveConn.query(
        `UPDATE users
         SET white_label_plan = 'paid',
             white_label_subscription_provider = 'paypal',
             white_label_subscription_id = ?,
             white_label_subscription_status = 'pending',
             white_label_next_billing_at = ?
         WHERE id = ?
         LIMIT 1`,
        [subscription.id, nextBillingAt, userId]
      );
    } finally {
      saveConn.release();
    }

    return NextResponse.json({
      ok: true,
      subscription_id: subscription.id,
      approval_url: subscription.approveUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
