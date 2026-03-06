type KeepaMarketplace = "UK" | "CA" | "US";

type KeepaMarketConfig = {
  domain: number;
  currency: "GBP" | "CAD" | "USD";
  amazonHost: string;
};

const KEEP_A_BASE_URL = "https://api.keepa.com";

const MARKET_CONFIG: Record<KeepaMarketplace, KeepaMarketConfig> = {
  US: {
    domain: Number(process.env.KEEPA_DOMAIN_US || "1"),
    currency: "USD",
    amazonHost: "www.amazon.com",
  },
  UK: {
    domain: Number(process.env.KEEPA_DOMAIN_UK || "2"),
    currency: "GBP",
    amazonHost: "www.amazon.co.uk",
  },
  CA: {
    domain: Number(process.env.KEEPA_DOMAIN_CA || "6"),
    currency: "CAD",
    amazonHost: "www.amazon.ca",
  },
};

function requireKeepaKey() {
  const key = String(process.env.KEEPA_API_KEY || "").trim();
  if (!key) throw new Error("Missing KEEPA_API_KEY");
  return key;
}

function normalizeKeepaPrice(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num / 100;
}

function pickNumber(values: any[]) {
  for (const v of values) {
    const num = normalizeKeepaPrice(v);
    if (num != null) return num;
  }
  return null;
}

function pickMin(values: any[]) {
  const cleaned = values
    .map((v) => normalizeKeepaPrice(v))
    .filter((v) => v != null) as number[];
  if (!cleaned.length) return null;
  return Math.min(...cleaned);
}

function pickMax(values: any[]) {
  const cleaned = values
    .map((v) => normalizeKeepaPrice(v))
    .filter((v) => v != null) as number[];
  if (!cleaned.length) return null;
  return Math.max(...cleaned);
}

function pickStatValue(stats: any, key: string) {
  if (!stats || !stats[key]) return null;
  return pickNumber([stats[key]?.[1], stats[key]?.[0]]);
}

function buildAmazonUrl(asin: string, marketplace: KeepaMarketplace) {
  const host = MARKET_CONFIG[marketplace].amazonHost;
  return `https://${host}/dp/${asin}`;
}

async function keepaRequest(path: string, params: Record<string, string | number | undefined>) {
  const key = requireKeepaKey();
  const url = new URL(`${KEEP_A_BASE_URL}/${path}`);
  url.searchParams.set("key", key);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Keepa error (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json().catch(() => null);
  const payload = data || {};
  const err =
    payload?.error?.message ||
    payload?.error ||
    payload?.errorMessage ||
    payload?.message ||
    null;
  if (err) {
    throw new Error(`Keepa error: ${String(err)}`);
  }
  return payload;
}

async function keepaBinaryRequest(path: string, params: Record<string, string | number | undefined>) {
  const key = requireKeepaKey();
  const url = new URL(`${KEEP_A_BASE_URL}/${path}`);
  url.searchParams.set("key", key);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Keepa error (${res.status}): ${text || res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return { contentType, buf };
}

export async function searchKeepaAsin(term: string, marketplace: KeepaMarketplace) {
  if (!term.trim()) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("search", {
    domain,
    type: "product",
    term: term.trim(),
    "asins-only": 1,
    page: 0,
    history: 0,
  });
  const asin = data?.products?.[0]?.asin || data?.asinList?.[0] || data?.asin?.[0] || null;
  return asin ? String(asin).trim() : null;
}

export async function fetchKeepaPrice(asin: string, marketplace: KeepaMarketplace) {
  if (!asin) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("product", {
    domain,
    asin,
    stats: 1,
  });

  const product = data?.products?.[0];
  if (!product) return null;
  const stats = product.stats || {};

  const current = pickStatValue(stats, "current");
  const avg30 = pickStatValue(stats, "avg30");
  const avg90 = pickStatValue(stats, "avg90");
  const minVal = pickMin([stats.min?.[1], stats.min?.[0]]);
  const maxVal = pickMax([stats.max?.[1], stats.max?.[0]]);
  const offerCountRaw = stats.totalOfferCount ?? stats.offerCount ?? product.offerCount ?? null;
  const offerCount = Number.isFinite(Number(offerCountRaw)) ? Number(offerCountRaw) : null;

  const low =
    pickMin([stats.min?.[1], stats.min?.[0]]) ??
    pickNumber([stats.current?.[1], stats.current?.[0], stats.avg30?.[1], stats.avg30?.[0]]);

  const high =
    pickMax([stats.max?.[1], stats.max?.[0]]) ??
    pickNumber([stats.current?.[1], stats.current?.[0], stats.avg30?.[1], stats.avg30?.[0]]);

  const safeLow = low ?? high;
  const safeHigh = high ?? low;

  return {
    asin: String(product.asin || asin),
    currency: MARKET_CONFIG[marketplace].currency,
    url: buildAmazonUrl(String(product.asin || asin), marketplace),
    price_low: safeLow ?? null,
    price_high: safeHigh ?? null,
    price_current: current,
    price_avg30: avg30,
    price_avg90: avg90,
    price_min: minVal,
    price_max: maxVal,
    offer_count: offerCount,
  };
}

export async function fetchKeepaProductRaw(asin: string, marketplace: KeepaMarketplace) {
  if (!asin) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("product", {
    domain,
    asin,
    stats: 1,
  });
  return data || null;
}

export async function fetchKeepaProductDetails(
  asin: string,
  marketplace: KeepaMarketplace,
  options: { history?: 0 | 1; rating?: 0 | 1; update?: number; offers?: number } = {}
) {
  if (!asin) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("product", {
    domain,
    asin,
    stats: 1,
    history: options.history ?? 1,
    rating: options.rating ?? 1,
    update: options.update,
    offers: options.offers,
  });
  return data || null;
}

export async function fetchKeepaGraphImage(
  asin: string,
  marketplace: KeepaMarketplace,
  params: Record<string, string | number | undefined>
) {
  if (!asin) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  return keepaBinaryRequest("graphimage", {
    domain,
    asin,
    ...params,
  });
}

export function getKeepaCurrency(marketplace: KeepaMarketplace) {
  return MARKET_CONFIG[marketplace].currency;
}

export function keepaMarketplaces(): KeepaMarketplace[] {
  return ["UK", "CA", "US"];
}

export function isKeepaMarketplaceSupported(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return false;
  return keepaMarketplaces().includes(raw as KeepaMarketplace);
}
