import crypto from "crypto";

export function getProvidusConfig() {
  const baseUrl = String(process.env.PROVIDUS_BASE_URL || "").trim();
  const clientId = String(process.env.PROVIDUS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PROVIDUS_CLIENT_SECRET || "").trim();

  if (!baseUrl || !clientId || !clientSecret) {
    return {
      ok: false as const,
      error: "Missing PROVIDUS_BASE_URL/PROVIDUS_CLIENT_ID/PROVIDUS_CLIENT_SECRET",
    };
  }

  return { ok: true as const, baseUrl, clientId, clientSecret };
}

export function providusSignature(clientId: string, clientSecret: string) {
  return crypto.createHash("sha512").update(`${clientId}:${clientSecret}`).digest("hex");
}

export function providusHeaders() {
  const cfg = getProvidusConfig();
  if (!cfg.ok) return cfg;

  const sig = providusSignature(cfg.clientId, cfg.clientSecret);
  return {
    ok: true as const,
    headers: {
      "Content-Type": "application/json",
      "Client-Id": cfg.clientId,
      "X-Auth-Signature": sig,
    },
  };
}

export function normalizeProvidusBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
