import crypto from "crypto";

type MetaCapiLeadInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  eventSourceUrl?: string | null;
  eventName?: string | null;
  customData?: Record<string, any> | null;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clean(value?: string | null) {
  return String(value || "").trim();
}

export async function sendMetaLeadEvent(input: MetaCapiLeadInput) {
  const pixelId = clean(process.env.META_PIXEL_ID);
  const accessToken = clean(process.env.META_CAPI_ACCESS_TOKEN);
  if (!pixelId || !accessToken) {
    return { ok: false as const, error: "Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN" };
  }

  const email = clean(input.email).toLowerCase();
  if (!email) return { ok: false as const, error: "Missing email" };

  const firstName = clean(input.firstName).toLowerCase();
  const lastName = clean(input.lastName).toLowerCase();

  const userData: Record<string, any> = {
    em: sha256(email),
  };

  if (firstName) userData.fn = sha256(firstName);
  if (lastName) userData.ln = sha256(lastName);
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const fbclid = clean(input.fbclid);
  const fbc = clean(input.fbc) || (fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : "");
  const fbp = clean(input.fbp);
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const payload = {
    data: [
      {
        event_name: clean(input.eventName) || "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: input.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: input.customData || undefined,
      },
    ],
  };

  const testCode = clean(process.env.META_CAPI_TEST_EVENT_CODE);
  if (testCode) {
    (payload as any).test_event_code = testCode;
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(
    accessToken
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false as const, error: json || `Meta CAPI error (${res.status})` };
  }
  return { ok: true as const, data: json };
}
