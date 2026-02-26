import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paypalCancelSubscription, paypalGetSubscription } from "@/lib/paypal";
import { ensureWhiteLabelUserColumns } from "@/lib/white-label-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const conn = await db.getConnection();
    try {
      await ensureWhiteLabelUserColumns(conn);
      const [[row]]: any = await conn.query(
        `
        SELECT white_label_subscription_provider,
               white_label_subscription_id,
               white_label_subscription_status,
               white_label_next_billing_at
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [user.id]
      );

      const provider = String(row?.white_label_subscription_provider || "").toLowerCase();
      const subscriptionId = String(row?.white_label_subscription_id || "").trim();
      if (provider !== "paypal" || !subscriptionId) {
        return NextResponse.json({ ok: false, error: "No active PayPal subscription found." }, { status: 400 });
      }

      const details = await paypalGetSubscription(subscriptionId);
      const nextBillingAt = details?.billing_info?.next_billing_time || row?.white_label_next_billing_at || null;

      await paypalCancelSubscription(subscriptionId, "User requested cancellation via LineScout.");

      await conn.query(
        `
        UPDATE users
        SET white_label_subscription_status = 'cancelled',
            white_label_next_billing_at = ?
        WHERE id = ?
        LIMIT 1
        `,
        [nextBillingAt, user.id]
      );

      return NextResponse.json({ ok: true, next_billing_at: nextBillingAt || null });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
