import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paypalCreateOrder } from "@/lib/paypal";
import { ensureCountryConfig, ensureUserCountryColumns, backfillUserDefaults } from "@/lib/country-config";
import { convertAmount } from "@/lib/fx";
import { recordPaymentAttempt } from "@/lib/payment-attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
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

async function commitmentDueNgn() {
  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      "SELECT commitment_due_ngn FROM linescout_settings ORDER BY id DESC LIMIT 1"
    );
    const ngn = Number(rows?.[0]?.commitment_due_ngn || 0);
    return Number.isFinite(ngn) && ngn > 0 ? ngn : 0;
  } finally {
    conn.release();
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const userId = Number((u as any)?.id || 0);

    const body = await req.json().catch(() => ({}));
    const purpose = String(body?.purpose || "sourcing").trim();
    const routeType = body?.route_type;
    if (!isValidRouteType(routeType)) {
      return NextResponse.json({ ok: false, error: "Invalid route_type" }, { status: 400 });
    }

    const callbackUrl = safeCallbackUrl(req, body?.callback_url);
    if (!callbackUrl) {
      return NextResponse.json({ ok: false, error: "Invalid callback_url" }, { status: 400 });
    }

    let displayCurrency = "NGN";
    let settlementCurrency = "NGN";
    let countryIso2 = "";
    const conn = await db.getConnection();
    try {
      await ensureCountryConfig(conn);
      await ensureUserCountryColumns(conn);
      await backfillUserDefaults(conn);
      const [rows]: any = await conn.query(
        `
        SELECT u.display_currency_code, c.payment_provider, c.settlement_currency_code, c.iso2
        FROM users u
        LEFT JOIN linescout_countries c ON c.id = u.country_id
        WHERE u.id = ?
        LIMIT 1
        `,
        [userId]
      );
      settlementCurrency = String(rows?.[0]?.settlement_currency_code || "NGN").toUpperCase();
      countryIso2 = String(rows?.[0]?.iso2 || "").trim().toUpperCase();
      displayCurrency = String(rows?.[0]?.display_currency_code || settlementCurrency || "NGN").toUpperCase();
      if (countryIso2 === "NG") {
        return NextResponse.json(
          { ok: false, error: "PayPal is not available for Nigeria. Please use Paystack." },
          { status: 400 }
        );
      }
    } finally {
      conn.release();
    }

    const ngn = await commitmentDueNgn();
    if (!ngn) {
      return NextResponse.json(
        { ok: false, error: "Commitment fee is not configured. Please contact support." },
        { status: 500 }
      );
    }

    const fxConn = await db.getConnection();
    let displayAmount: number | null = null;
    let paypalAmount: number | null = null;
    const paypalCurrency = (settlementCurrency || displayCurrency || "USD").toUpperCase();
    try {
      displayAmount = await convertAmount(fxConn, ngn, "NGN", displayCurrency);
      if (!displayAmount || !Number.isFinite(displayAmount)) {
        displayAmount = null;
      }
      const baseForPayPal = displayAmount ?? ngn;
      const baseCurrency = displayAmount ? displayCurrency : "NGN";
      paypalAmount = await convertAmount(fxConn, baseForPayPal, baseCurrency, paypalCurrency);
    } finally {
      fxConn.release();
    }

    if (!paypalAmount || !Number.isFinite(paypalAmount) || paypalAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: `${paypalCurrency} exchange rate is not configured.` },
        { status: 500 }
      );
    }

    const amount = paypalAmount.toFixed(2);
    const returnUrl = `${callbackUrl}&provider=paypal`;
    const cancelUrl = callbackUrl;

    const customId = `LS_${userId}_${Date.now()}`;
    const order = await paypalCreateOrder({
      amount,
      currency: paypalCurrency,
      returnUrl,
      cancelUrl,
      customId,
      description: purpose === "sourcing" ? "LineScout sourcing commitment" : "LineScout payment",
    });

    if (!order.approveUrl) {
      return NextResponse.json(
        { ok: false, error: "PayPal approval URL missing." },
        { status: 500 }
      );
    }

    try {
      const saveConn = await db.getConnection();
      try {
        await recordPaymentAttempt(saveConn, {
          provider: "paypal",
          reference: order.id,
          userId,
          purpose,
          routeType,
          amount: Number.isFinite(Number(amount)) ? Number(amount) : null,
          currency: paypalCurrency,
          meta: {
            source_conversation_id: body?.source_conversation_id || null,
            reorder_of_conversation_id: body?.reorder_of_conversation_id || null,
            reorder_user_note: body?.reorder_user_note || null,
            product_id: body?.product_id || null,
            product_name: body?.product_name || null,
            product_category: body?.product_category || null,
            product_landed_ngn_per_unit: body?.product_landed_ngn_per_unit || null,
            simple_product_name: body?.simple_product_name || null,
            simple_quantity: body?.simple_quantity || null,
            simple_destination: body?.simple_destination || null,
            simple_notes: body?.simple_notes || null,
          },
        });
      } finally {
        saveConn.release();
      }
    } catch {
      // Non-fatal: payment init should not fail on telemetry.
    }

    return NextResponse.json({
      ok: true,
      order_id: order.id,
      approval_url: order.approveUrl,
      currency: paypalCurrency,
      amount,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
