import { signPayPalCheckoutSession } from "./paypalCheckoutSession";
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

export function paypalClientId() { return process.env.PAYPAL_CLIENT_ID?.trim() || ""; }

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
  const returnUrl = new URL(params.returnUrl);
  const cancelUrl = new URL(params.cancelUrl);
  if (returnUrl.origin !== cancelUrl.origin || !['http:', 'https:'].includes(returnUrl.protocol)) throw new Error('Invalid checkout destination.');
  if (!/^\d+\.\d{2}$/.test(params.amount) || Number(params.amount) <= 0 || params.currency === 'NGN') throw new Error('Invalid PayPal amount or currency.');
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
        brand_name: "Sure Imports",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal create order failed");
  }
  const checkout = new URL('/checkout/paypal', returnUrl.origin);
  checkout.searchParams.set('session', signPayPalCheckoutSession({
    orderId: String(json.id), amount: params.amount, currency: params.currency,
    description: params.description || 'LineScout payment',
    returnPath: returnUrl.pathname + returnUrl.search,
    cancelPath: cancelUrl.pathname + cancelUrl.search,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  }));
  const approve = checkout.toString();
  return {
    id: String(json.id),
    approveUrl: approve ? String(approve) : null,
    raw: json,
  };
}

export async function paypalCreateProduct(params: {
  name: string;
  description?: string | null;
}) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      description: params.description || undefined,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal create product failed");
  }
  return { id: String(json.id), raw: json };
}

export async function paypalCreatePlan(params: {
  productId: string;
  name: string;
  currency: string;
  price: string;
  interval: "MONTH" | "YEAR";
  intervalCount?: number;
}) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: params.productId,
      name: params.name,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: params.interval,
            interval_count: params.intervalCount || 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: params.price,
              currency_code: params.currency,
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal create plan failed");
  }
  return { id: String(json.id), raw: json };
}

export async function paypalCreateSubscription(params: {
  planId: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string | null;
}) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: params.planId,
      ...(params.customId ? { custom_id: params.customId } : {}),
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal create subscription failed");
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

export async function paypalGetPlan(planId: string) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/billing/plans/${encodeURIComponent(planId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal get plan failed");
  }
  return json;
}

export async function paypalCaptureOrder(orderId: string) {
  const existing = await paypalGetOrder(orderId);
  if (existing.status === 'COMPLETED') return existing;
  if (existing.status !== 'APPROVED') throw new Error('Approve this payment before capture.');
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture-${orderId}`,
    },
  }).catch(async () => {
    const recovered = await paypalGetOrder(orderId).catch(() => null);
    if (recovered?.status === 'COMPLETED') return Response.json(recovered);
    throw new Error('Payment confirmation is pending. Check your order before trying again.');
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status >= 500 || json?.details?.some((item: any) => item.issue === 'ORDER_ALREADY_CAPTURED')) {
      const recovered = await paypalGetOrder(orderId);
      if (recovered.status === 'COMPLETED') return recovered;
    }
    throw new Error(json?.message || "PayPal capture failed");
  }
  return json;
}

export async function paypalGetOrder(orderId: string) {
  const token = await paypalAccessToken();
  const res = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.message || "PayPal order lookup failed");
  }
  return json;
}

export async function paypalCreatePayout(params: {
  receiverEmail: string;
  amount: string;
  currency: string;
  note?: string | null;
  senderBatchId?: string | null;
}) {
  const token = await paypalAccessToken();
  const batchId = params.senderBatchId || `LS_AFF_${Date.now()}`;

  const res = await fetch(`${paypalBaseUrl()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "You have a payout from LineScout",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: params.amount,
            currency: params.currency,
          },
          receiver: params.receiverEmail,
          note: params.note || undefined,
        },
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.batch_header?.payout_batch_id) {
    throw new Error(json?.message || "PayPal payout failed");
  }

  return {
    payoutId: String(json.batch_header.payout_batch_id),
    raw: json,
  };
}

export async function paypalGetSubscription(subscriptionId: string) {
  const token = await paypalAccessToken();
  const res = await fetch(
    `${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || "PayPal subscription lookup failed");
  }
  return json;
}

export async function paypalCancelSubscription(subscriptionId: string, reason?: string) {
  const token = await paypalAccessToken();
  const res = await fetch(
    `${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: reason || "User requested cancellation.",
      }),
    }
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || "PayPal subscription cancel failed");
  }
  return { ok: true };
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

// Use only persisted server prices, including the configured processing fee.
export async function paypalVerifyPayment(orderId: string, expected: { amount: number; currency: string; customIdPrefix: string }) {
  const matches = (order: any) => {
    const units = order?.purchase_units;
    const amount = Math.round(expected.amount * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Array.isArray(units) || units.length !== 1 ||
        !String(units[0]?.custom_id || '').startsWith(expected.customIdPrefix) ||
        units[0]?.amount?.currency_code !== expected.currency || Math.round(Number(units[0]?.amount?.value) * 100) !== amount)
      throw new Error('PayPal payment does not match the saved quotation.');
  };
  let order = await paypalGetOrder(orderId);
  matches(order);
  if (order.status !== 'COMPLETED') {
    await paypalCaptureOrder(orderId);
    order = await paypalGetOrder(orderId);
  }
  matches(order);
  const captures = order.purchase_units[0].payments?.captures;
  if (order.status !== 'COMPLETED' || !Array.isArray(captures) || captures.length !== 1 ||
      !captures[0]?.id || captures[0].status !== 'COMPLETED' || captures[0].amount?.currency_code !== expected.currency ||
      Math.round(Number(captures[0].amount?.value) * 100) !== Math.round(expected.amount * 100))
    throw new Error('Payment has not been confirmed. Check your order before retrying.');
  if (paypalEnv() === 'sandbox') throw new Error('Sandbox payment confirmed. No live order or ledger was changed.');
  return order;
}
