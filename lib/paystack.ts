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

export async function paystackFetchCustomer(emailOrCode: string) {
  const sec = paystackSecret();
  if (!sec.ok) return { ok: false as const, status: 500, error: sec.error };

  const res = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(emailOrCode)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sec.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const raw = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.status) {
    const msg = String(json?.message || raw || `Paystack fetch customer failed (${res.status})`);
    return { ok: false as const, status: res.status, error: msg };
  }

  return { ok: true as const, data: json.data };
}

export async function paystackUpdateCustomer(customerCode: string, params: {
  first_name?: string;
  last_name?: string;
  phone?: string;
}) {
  const sec = paystackSecret();
  if (!sec.ok) return { ok: false as const, status: 500, error: sec.error };

  const res = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(customerCode)}`, {
    method: "PUT",
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
    const msg = String(json?.message || raw || `Paystack update customer failed (${res.status})`);
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

export function normalizeNigerianPhone(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (s.startsWith("+")) return s;

  const digits = s.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;

  return null;
}

export function nigerianPhoneCandidates(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return [];

  const candidates: string[] = [];
  const digits = s.replace(/\D/g, "");

  if (s.startsWith("+")) {
    candidates.push(s);
    if (digits.startsWith("234") && digits.length >= 13) {
      const local = `0${digits.slice(3)}`;
      if (local.length === 11) candidates.push(local);
    }
  }
  if (digits) {
    if (digits.startsWith("0") && digits.length === 11) {
      candidates.push(digits);
      candidates.push(`+234${digits.slice(1)}`);
      candidates.push(`234${digits.slice(1)}`);
    } else if (digits.startsWith("234") && digits.length >= 13) {
      candidates.push(`+${digits}`);
      candidates.push(digits);
    } else {
      candidates.push(digits);
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}
