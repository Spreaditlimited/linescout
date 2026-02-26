export type AmazonMarketplace = "UK" | "CA" | "US";

export function normalizeAmazonMarketplace(value?: string | null): AmazonMarketplace | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "UK" || raw === "GB") return "UK";
  if (raw === "CA") return "CA";
  if (raw === "US" || raw === "USA") return "US";
  return null;
}

export function resolveAmazonMarketplace(params: {
  marketplace?: string | null;
  countryIso2?: string | null;
  currencyCode?: string | null;
}): AmazonMarketplace {
  const preferred = normalizeAmazonMarketplace(params.marketplace);
  if (preferred) return preferred;
  const fromIso = normalizeAmazonMarketplace(params.countryIso2);
  if (fromIso) return fromIso;
  const code = String(params.currencyCode || "").trim().toUpperCase();
  if (code === "USD") return "US";
  if (code === "CAD") return "CA";
  return "UK";
}

export function marketplaceCurrency(marketplace: AmazonMarketplace): "GBP" | "CAD" | "USD" {
  if (marketplace === "CA") return "CAD";
  if (marketplace === "US") return "USD";
  return "GBP";
}
