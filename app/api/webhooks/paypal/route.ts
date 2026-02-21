import { NextResponse } from "next/server";
import { paypalVerifyWebhookSignature } from "@/lib/paypal";

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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
