import crypto from "crypto";

export function paystackSecret() {
  const secret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (!secret) {
    return { ok: false as const, error: "Missing PAYSTACK_SECRET_KEY" };
  }
  return { ok: true as const, secret };
}

export function verifyPaystackSignature(rawBody: string, signature: string) {
  const sec = paystackSecret();
  if (!sec.ok) return { ok: false as const, error: sec.error };
  const hash = crypto.createHmac("sha512", sec.secret).update(rawBody).digest("hex");
  return { ok: true as const, valid: hash === String(signature || "").trim() };
}

export async function paystackCreateCustomer(params: {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}) {
  const sec = paystackSecret();
  if (!sec.ok) return { ok: false as const, status: 500, error: sec.error };

  const res = await fetch("https://api.paystack.co/customer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sec.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.status) {
    const msg = String(json?.message || raw || `Paystack create customer failed (${res.status})`);
    return { ok: false as const, status: 400, error: msg };
  }

  return { ok: true as const, data: json.data };
}

export async function paystackAssignDedicatedAccount(params: {
  customer: string;
  preferred_bank?: string;
}) {
  const sec = paystackSecret();
  if (!sec.ok) return { ok: false as const, status: 500, error: sec.error };

  const res = await fetch("https://api.paystack.co/dedicated_account", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sec.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.status) {
    const msg = String(json?.message || raw || `Paystack dedicated account failed (${res.status})`);
    return { ok: false as const, status: 400, error: msg };
  }

  return { ok: true as const, data: json.data };
}
