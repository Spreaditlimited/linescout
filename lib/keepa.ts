type KeepaMarketplace = "UK" | "CA";

type KeepaMarketConfig = {
  domain: number;
  currency: "GBP" | "CAD";
  amazonHost: string;
};

const KEEP_A_BASE_URL = "https://api.keepa.com";

const MARKET_CONFIG: Record<KeepaMarketplace, KeepaMarketConfig> = {
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

export async function searchKeepaAsin(term: string, marketplace: KeepaMarketplace) {
  if (!term.trim()) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("search", {
    domain,
    type: "product",
    term: term.trim(),
    page: 0,
  });
  const asin =
    data?.asinList?.[0] ||
    data?.asin?.[0] ||
    data?.products?.[0]?.asin ||
    null;
  return asin ? String(asin).trim() : null;
}

export async function fetchKeepaPrice(asin: string, marketplace: KeepaMarketplace) {
  if (!asin) return null;
  const domain = MARKET_CONFIG[marketplace].domain;
  const data = await keepaRequest("product", {
    domain,
    asin,
    stats: 1,
    offers: 0,
    history: 0,
    buybox: 0,
  });

  const product = data?.products?.[0];
  if (!product) return null;
  const stats = product.stats || {};

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
  };
}

export function getKeepaCurrency(marketplace: KeepaMarketplace) {
  return MARKET_CONFIG[marketplace].currency;
}

export function keepaMarketplaces(): KeepaMarketplace[] {
  return ["UK", "CA"];
}
