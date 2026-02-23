import { NextResponse } from "next/server";
import { paypalVerifyWebhookSignature } from "@/lib/paypal";
import { db } from "@/lib/db";
import { ensureWhiteLabelUserColumns } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const headers = {
      "paypal-transmission-id": req.headers.get("paypal-transmission-id"),
      "paypal-transmission-time": req.headers.get("paypal-transmission-time"),
      "paypal-cert-url": req.headers.get("paypal-cert-url"),
      "paypal-auth-algo": req.headers.get("paypal-auth-algo"),
      "paypal-transmission-sig": req.headers.get("paypal-transmission-sig"),
    };

    const verification = await paypalVerifyWebhookSignature({ body, headers });
    const status = String(verification?.verification_status || "");
    if (status !== "SUCCESS") {
      return NextResponse.json({ ok: false, error: "Invalid PayPal signature" }, { status: 400 });
    }

    const eventType = String(body?.event_type || "").toUpperCase();
    const resource = body?.resource || {};
    const subscriptionId = String(resource?.id || "");
    const customId = String(resource?.custom_id || "");

    const userIdMatch = customId.match(/LS_USER_(\d+)/);
    const userId = userIdMatch ? Number(userIdMatch[1]) : null;

    if (subscriptionId && userId) {
      const conn = await db.getConnection();
      try {
        await ensureWhiteLabelUserColumns(conn);
        const setActive = () =>
          conn.query(
            `UPDATE users
             SET white_label_plan = 'paid',
                 white_label_subscription_provider = 'paypal',
                 white_label_subscription_id = ?,
                 white_label_subscription_status = 'active'
             WHERE id = ?
             LIMIT 1`,
            [subscriptionId, userId]
          );

        const setStatus = (status: string, plan: string) =>
          conn.query(
            `UPDATE users
             SET white_label_plan = ?,
                 white_label_subscription_provider = 'paypal',
                 white_label_subscription_id = ?,
                 white_label_subscription_status = ?
             WHERE id = ?
             LIMIT 1`,
            [plan, subscriptionId, status, userId]
          );

        if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
          await setActive();
        } else if (eventType === "BILLING.SUBSCRIPTION.CREATED") {
          await setStatus("pending", "paid");
        } else if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
          await setStatus("cancelled", "free");
        } else if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED") {
          await setStatus("suspended", "free");
        } else if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
          await setStatus("expired", "free");
        } else if (eventType === "BILLING.SUBSCRIPTION.RE-ACTIVATED") {
          await setActive();
        }
      } finally {
        conn.release();
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
