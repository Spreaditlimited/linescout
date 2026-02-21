type PayPalEnv = "live" | "sandbox";

function paypalEnv(): PayPalEnv {
  const raw = String(process.env.PAYPAL_ENV || "live").trim().toLowerCase();
  return raw === "sandbox" ? "sandbox" : "live";
}

function paypalBaseUrl() {
  return paypalEnv() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

function paypalAuthHeader() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) return null;
  const token = Buffer.from(`${clientId}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

export async function paypalAccessToken() {
  const auth = paypalAuthHeader();
  if (!auth) throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.message || "PayPal auth failed");
  }
  return String(json.access_token);
}

export async function paypalCreateOrder(params: {
  amount: string;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string | null;
  description?: string | null;
}) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: params.currency,
            value: params.amount,
          },
          ...(params.customId ? { custom_id: params.customId } : {}),
          ...(params.description ? { description: params.description } : {}),
        },
      ],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal create order failed");
  }
  const approve = Array.isArray(json?.links)
    ? json.links.find((l: any) => l?.rel === "approve")?.href
    : null;
  return {
    id: String(json.id),
    approveUrl: approve ? String(approve) : null,
    raw: json,
  };
}

export async function paypalCaptureOrder(orderId: string) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || "PayPal capture failed");
  }
  return json;
}

export async function paypalVerifyWebhookSignature(params: {
  body: any;
  headers: Record<string, string | null>;
}) {
  const token = await paypalAccessToken();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) throw new Error("Missing PAYPAL_WEBHOOK_ID");
  const payload = {
    webhook_id: webhookId,
    transmission_id: params.headers["paypal-transmission-id"],
    transmission_time: params.headers["paypal-transmission-time"],
    cert_url: params.headers["paypal-cert-url"],
    auth_algo: params.headers["paypal-auth-algo"],
    transmission_sig: params.headers["paypal-transmission-sig"],
    webhook_event: params.body,
  };
  const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || "PayPal webhook verify failed");
  }
  return json;
}
