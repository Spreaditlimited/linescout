import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listStuckPaymentAttempts } from "@/lib/payment-attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronRequest(req: Request) {
  const vercelCron = String(req.headers.get("x-vercel-cron") || "").trim();
  if (vercelCron === "1") return true;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const headerSecret = String(req.headers.get("x-cron-secret") || "").trim();
  return headerSecret && headerSecret === secret;
}

function internalSecret() {
  return (process.env.CRON_SECRET || process.env.PAYMENT_RECONCILE_SECRET || "").trim();
}

export async function GET(req: Request) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const secret = internalSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET or PAYMENT_RECONCILE_SECRET" }, { status: 500 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  const conn = await db.getConnection();
  try {
    const attempts = await listStuckPaymentAttempts(conn as any, { olderThanMinutes: 15, limit: 20 });
    const results: any[] = [];

    for (const attempt of attempts) {
      const provider = String(attempt.provider || "").toLowerCase();
      const reference = String(attempt.reference || "").trim();
      if (!reference || (provider !== "paystack" && provider !== "paypal")) continue;

      const endpoint =
        provider === "paystack" ? "/api/payments/paystack/verify" : "/api/payments/paypal/verify";
      const payload =
        provider === "paystack"
          ? { reference, purpose: attempt.purpose || "sourcing" }
          : { order_id: reference };

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify(payload),
      }).catch(() => null);

      let status = "skipped";
      if (res) {
        status = res.ok ? "ok" : "failed";
      }
      results.push({ provider, reference, status });
    }

    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  } finally {
    conn.release();
  }
}
