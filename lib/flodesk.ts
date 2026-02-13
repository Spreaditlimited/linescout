export type FlodeskSubscriberInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  segmentId: string;
};

export async function upsertFlodeskSubscriber(input: FlodeskSubscriberInput) {
  const apiKey = process.env.FLODESK_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: "Missing FLODESK_API_KEY" };
  }

  if (!input.segmentId) {
    return { ok: false as const, error: "Missing Flodesk segment id" };
  }

  const payload = {
    email: input.email,
    first_name: input.firstName || undefined,
    last_name: input.lastName || undefined,
    segment_ids: [input.segmentId],
    double_optin: false,
  };

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const res = await fetch("https://api.flodesk.com/v1/subscribers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "User-Agent": "LineScout (linescout.sureimports.com)",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || json?.error || `Flodesk error ${res.status}`;
    return { ok: false as const, error: msg };
  }

  return { ok: true as const, data: json };
}
