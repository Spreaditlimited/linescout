import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import MarketingTopNav from "@/components/MarketingTopNav";
import WhiteLabelViewTracker from "@/components/white-label/WhiteLabelViewTracker";
import DeferredSection from "@/components/white-label/DeferredSection";
import { currencyForCode, formatCurrency, pickLandedFieldsByCurrency } from "@/lib/white-label-country";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";
import { marketplaceCurrency, normalizeAmazonMarketplace } from "@/lib/white-label-marketplace";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";
import { getFxRate } from "@/lib/fx";

export const runtime = "nodejs";
export const revalidate = 3600;

const BASE_URL = "https://linescout.sureimports.com";

type ProductRow = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  business_summary: string | null;
  market_notes: string | null;
  white_label_angle: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  landed_per_unit_low?: number | null;
  landed_per_unit_high?: number | null;
  landed_total_1000_low?: number | null;
  landed_total_1000_high?: number | null;
  landed_currency_code?: string | null;
  amazon_uk_asin?: string | null;
  amazon_uk_url?: string | null;
  amazon_uk_currency?: string | null;
  amazon_uk_price_low?: number | null;
  amazon_uk_price_high?: number | null;
  amazon_uk_last_checked_at?: string | null;
  amazon_ca_asin?: string | null;
  amazon_ca_url?: string | null;
  amazon_ca_currency?: string | null;
  amazon_ca_price_low?: number | null;
  amazon_ca_price_high?: number | null;
  amazon_ca_last_checked_at?: string | null;
  amazon_us_asin?: string | null;
  amazon_us_url?: string | null;
  amazon_us_currency?: string | null;
  amazon_us_price_low?: number | null;
  amazon_us_price_high?: number | null;
  amazon_us_last_checked_at?: string | null;
  view_count?: number | null;
};

function formatPerUnitRangeWithCurrency(
  low: number | null | undefined,
  high: number | null | undefined,
  currency: ReturnType<typeof currencyForCode>
) {
  const perUnitDigits = currency.code === "NGN" ? 0 : 2;
  const lowText = formatCurrency(low, currency, perUnitDigits);
  const highText = formatCurrency(high, currency, perUnitDigits);
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} per unit`;
  if (lowText !== "—") return `${lowText} per unit`;
  if (highText !== "—") return `${highText} per unit`;
  return "";
}

function formatAmazonPriceRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string
) {
  const code = String(currencyCode || "").toUpperCase() || "GBP";
  const fmt = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    try {
      return new Intl.NumberFormat(code === "GBP" ? "en-GB" : code === "USD" ? "en-US" : "en-CA", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(Number(value));
    } catch {
      const symbol = code === "GBP" ? "£" : code === "CAD" ? "CA$" : code === "USD" ? "$" : "";
      return `${symbol}${Number(value).toFixed(2)}`;
    }
  };
  const lowText = fmt(low);
  const highText = fmt(high);
  if (lowText !== "—" && highText !== "—" && Number(low) === Number(high)) {
    return lowText;
  }
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText}`;
  if (lowText !== "—") return lowText;
  if (highText !== "—") return highText;
  return "—";
}

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatRegulatoryNote(note: string | null, countryIso2: string) {
  const cleaned = String(note || "").trim();
  if (!cleaned) return "Not specified.";
  const isNg = String(countryIso2 || "").toUpperCase() === "NG";
  if (!isNg && /nafdac/i.test(cleaned)) {
    return "Regulatory requirements vary by market. We’ll guide you through local compliance for your country.";
  }
  return cleaned;
}

function pickProductLandedByCurrency(row: any, currencyCode: string) {
  const code = String(currencyCode || "").toUpperCase();
  if (code === "GBP") {
    return {
      low: row.landed_gbp_sea_per_unit_low != null ? Number(row.landed_gbp_sea_per_unit_low) : null,
      high: row.landed_gbp_sea_per_unit_high != null ? Number(row.landed_gbp_sea_per_unit_high) : null,
      totalLow: row.landed_gbp_sea_total_1000_low != null ? Number(row.landed_gbp_sea_total_1000_low) : null,
      totalHigh: row.landed_gbp_sea_total_1000_high != null ? Number(row.landed_gbp_sea_total_1000_high) : null,
    };
  }
  if (code === "CAD") {
    return {
      low: row.landed_cad_sea_per_unit_low != null ? Number(row.landed_cad_sea_per_unit_low) : null,
      high: row.landed_cad_sea_per_unit_high != null ? Number(row.landed_cad_sea_per_unit_high) : null,
      totalLow: row.landed_cad_sea_total_1000_low != null ? Number(row.landed_cad_sea_total_1000_low) : null,
      totalHigh: row.landed_cad_sea_total_1000_high != null ? Number(row.landed_cad_sea_total_1000_high) : null,
    };
  }
  if (code === "USD") {
    return {
      low: row.landed_usd_sea_per_unit_low != null ? Number(row.landed_usd_sea_per_unit_low) : null,
      high: row.landed_usd_sea_per_unit_high != null ? Number(row.landed_usd_sea_per_unit_high) : null,
      totalLow: row.landed_usd_sea_total_1000_low != null ? Number(row.landed_usd_sea_total_1000_low) : null,
      totalHigh: row.landed_usd_sea_total_1000_high != null ? Number(row.landed_usd_sea_total_1000_high) : null,
    };
  }
  return {
    low: row.landed_ngn_per_unit_low != null ? Number(row.landed_ngn_per_unit_low) : null,
    high: row.landed_ngn_per_unit_high != null ? Number(row.landed_ngn_per_unit_high) : null,
    totalLow: row.landed_ngn_total_1000_low != null ? Number(row.landed_ngn_total_1000_low) : null,
    totalHigh: row.landed_ngn_total_1000_high != null ? Number(row.landed_ngn_total_1000_high) : null,
  };
}

function pickCountryFromCookie(
  cookieValue: string | undefined,
  countries: {
    id: number;
    name: string;
    iso2: string;
    default_currency_id?: number | null;
    settlement_currency_code?: string | null;
    amazon_marketplace?: string | null;
    amazon_enabled?: number | boolean | null;
  }[]
) {
  const normalized = String(cookieValue || "").trim().toUpperCase();
  const picked =
    countries.find((c) => c.iso2 === normalized) ||
    (normalized === "UK" ? countries.find((c) => c.iso2 === "GB") : null) ||
    countries.find((c) => c.iso2 === "NG") ||
    countries[0] ||
    null;
  return picked;
}

function getCountryCurrencyCode(
  country: { default_currency_id?: number | null; settlement_currency_code?: string | null } | null,
  currencyById: Map<number, string>
) {
  if (!country) return "NGN";
  const fromDefault = country.default_currency_id
    ? currencyById.get(Number(country.default_currency_id)) || null
    : null;
  const candidate = String(fromDefault || country.settlement_currency_code || "NGN").toUpperCase();
  return candidate || "NGN";
}

function parseEligibleCountries(raw?: string | null) {
  const source = String(raw || "GB,CA");
  return source
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((c) => (c === "UK" ? "GB" : c));
}

function fallbackSeoDescription(product: ProductRow) {
  return (
    product.seo_description ||
    product.short_desc ||
    product.why_sells ||
    `White label ${product.product_name} idea tailored for founders and business owners in your market.`
  );
}

function fallbackSummary(product: ProductRow) {
  if (product.business_summary) return product.business_summary;
  const desc = product.short_desc || "a fast-moving white label product";
  const why = product.why_sells || "strong everyday demand";
  return `${product.product_name} is ${desc.toLowerCase()} built for entrepreneurs who want quick repeat sales. The market signals show ${why.toLowerCase()} and a clear path to brand differentiation.`;
}

function fallbackMarketNotes(product: ProductRow) {
  if (product.market_notes) return product.market_notes;
  return "Position this product for consumers who value reliability and affordability. Small minimum order quantities and strong offline demand make it a solid pick for first-time importers.";
}

function fallbackAngle(product: ProductRow) {
  if (product.white_label_angle) return product.white_label_angle;
  return "Focus on durable packaging, a clean brand story, and consistent availability. Offer bundles or starter kits to make your brand feel premium while keeping pricing accessible.";
}

function cloudinaryTransform(url: string, size: number) {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) {
    return url;
  }
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${size},h_${size},c_fit/`);
}

async function fetchProduct(slug: string) {
  const conn = await db.getConnection();
  try {
    await ensureWhiteLabelProductsReady(conn);

    const [rows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count
      FROM linescout_white_label_products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE (p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?) AND p.is_active = 1
      LIMIT 1
      `,
      [slug, slug]
    );

    return rows?.[0] || null;
  } finally {
    conn.release();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) {
    return {
      title: "White Label Idea | LineScout",
      description: "Explore white label product ideas with pricing signals and sourcing guidance.",
      alternates: { canonical: `${BASE_URL}/white-label` },
    };
  }

  const url = `${BASE_URL}/white-label/${product.slug || slugify(product.product_name)}`;

  return {
    title: product.seo_title || `${product.product_name} | White Label Idea`,
    description: fallbackSeoDescription(product),
    alternates: { canonical: url },
    openGraph: {
      title: product.seo_title || `${product.product_name} | White Label Idea`,
      description: fallbackSeoDescription(product),
      images: product.image_url ? [product.image_url] : undefined,
      url,
    },
  };
}

export default async function WhiteLabelMarketingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const countryCookie = cookieStore.get("wl_country")?.value;

  const conn = await db.getConnection();
  let product: ProductRow | null = null;
  let similar: ProductRow[] = [];
  let mostViewed: ProductRow[] = [];
  let currencyCode = "NGN";
  let countryId = 0;
  let countryIso2 = "";
  let amazonComparisonEnabled = false;
  let pickedCountry: { amazon_marketplace?: string | null } | null = null;
  try {
    await ensureCountryConfig(conn);
    await ensureWhiteLabelSettings(conn);
    const lists = await listActiveCountriesAndCurrencies(conn);
    const currencyById = new Map<number, string>(
      (lists.currencies || []).map((c: any) => [Number(c.id), String(c.code || "").toUpperCase()])
    );
    const picked = pickCountryFromCookie(countryCookie, (lists.countries || []) as any[]);
    pickedCountry = picked || null;
    currencyCode = getCountryCurrencyCode(picked, currencyById);
    countryIso2 = picked?.iso2 ? String(picked.iso2).toUpperCase() : "";
    countryId = picked?.id ? Number(picked.id) : 0;
    const [settingsRows]: any = await conn.query(
      `SELECT white_label_subscription_countries FROM linescout_settings ORDER BY id DESC LIMIT 1`
    );
    const eligible = new Set(parseEligibleCountries(settingsRows?.[0]?.white_label_subscription_countries));
    const normalizedMarketplace = normalizeAmazonMarketplace(picked?.amazon_marketplace);
    amazonComparisonEnabled =
      Boolean(countryIso2) &&
      eligible.has(countryIso2) &&
      Boolean(picked?.amazon_enabled) &&
      Boolean(normalizedMarketplace) &&
      isKeepaMarketplaceSupported(normalizedMarketplace);

    await ensureWhiteLabelProductsReady(conn);
    await ensureWhiteLabelLandedCostTable(conn);

    const [rows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count,
             lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
      FROM linescout_white_label_products p
      LEFT JOIN linescout_white_label_landed_costs lc
        ON lc.product_id = p.id AND lc.country_id = ?
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE (p.slug = ? OR REGEXP_REPLACE(LOWER(p.product_name), '[^a-z0-9]+', '-') = ?) AND p.is_active = 1
      LIMIT 1
      `,
      [countryId, slug, slug]
    );
    const ngnToDisplayFx =
      currencyCode === "NGN" ? 1 : await getFxRate(conn, "NGN", currencyCode);
    const withLanded = (item: any) => {
      let landedLow = item.landed_per_unit_low != null ? Number(item.landed_per_unit_low) : null;
      let landedHigh = item.landed_per_unit_high != null ? Number(item.landed_per_unit_high) : null;
      let landedTotalLow =
        item.landed_total_1000_low != null ? Number(item.landed_total_1000_low) : null;
      let landedTotalHigh =
        item.landed_total_1000_high != null ? Number(item.landed_total_1000_high) : null;

      const productLanded = pickProductLandedByCurrency(item, currencyCode);
      landedLow = landedLow ?? productLanded.low;
      landedHigh = landedHigh ?? productLanded.high;
      landedTotalLow = landedTotalLow ?? productLanded.totalLow;
      landedTotalHigh = landedTotalHigh ?? productLanded.totalHigh;

      if (landedLow == null || landedHigh == null || landedTotalLow == null || landedTotalHigh == null) {
        const computedNgn = computeLandedRange({
          fob_low_usd: item.fob_low_usd,
          fob_high_usd: item.fob_high_usd,
          cbm_per_1000: item.cbm_per_1000,
        });
        if (currencyCode === "NGN") {
          landedLow = landedLow ?? computedNgn.landed_ngn_per_unit_low;
          landedHigh = landedHigh ?? computedNgn.landed_ngn_per_unit_high;
          landedTotalLow = landedTotalLow ?? computedNgn.landed_ngn_total_1000_low;
          landedTotalHigh = landedTotalHigh ?? computedNgn.landed_ngn_total_1000_high;
        } else if (ngnToDisplayFx && ngnToDisplayFx > 0) {
          landedLow =
            landedLow ??
            (computedNgn.landed_ngn_per_unit_low != null
              ? Number(computedNgn.landed_ngn_per_unit_low) * ngnToDisplayFx
              : null);
          landedHigh =
            landedHigh ??
            (computedNgn.landed_ngn_per_unit_high != null
              ? Number(computedNgn.landed_ngn_per_unit_high) * ngnToDisplayFx
              : null);
          landedTotalLow =
            landedTotalLow ??
            (computedNgn.landed_ngn_total_1000_low != null
              ? Number(computedNgn.landed_ngn_total_1000_low) * ngnToDisplayFx
              : null);
          landedTotalHigh =
            landedTotalHigh ??
            (computedNgn.landed_ngn_total_1000_high != null
              ? Number(computedNgn.landed_ngn_total_1000_high) * ngnToDisplayFx
              : null);
        }
      }

      return {
        ...item,
        landed_per_unit_low: landedLow,
        landed_per_unit_high: landedHigh,
        landed_total_1000_low: landedTotalLow,
        landed_total_1000_high: landedTotalHigh,
        landed_currency_code: currencyCode,
      };
    };

    product = rows?.[0] ? withLanded(rows[0]) : null;

    if (!product) {
      notFound();
    }

    const [similarRows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count,
             lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
      FROM linescout_white_label_products p
      LEFT JOIN linescout_white_label_landed_costs lc
        ON lc.product_id = p.id AND lc.country_id = ?
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE p.category = ? AND p.id <> ? AND p.is_active = 1
      ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
      LIMIT 6
      `,
      [countryId, product.category, product.id]
    );
    similar = (similarRows || []).map(withLanded);

    const [viewRows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count,
             lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high, lc.landed_total_1000_low, lc.landed_total_1000_high
      FROM linescout_white_label_products p
      LEFT JOIN linescout_white_label_landed_costs lc
        ON lc.product_id = p.id AND lc.country_id = ?
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE p.is_active = 1
      ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
      LIMIT 6
      `,
      [countryId]
    );
    mostViewed = (viewRows || []).map(withLanded);
  } finally {
    conn.release();
  }

  const currency = currencyForCode(currencyCode);

  if (!product) return null;

  const landedPicked = {
    perUnitLow: product.landed_per_unit_low ?? null,
    perUnitHigh: product.landed_per_unit_high ?? null,
    totalLow: product.landed_total_1000_low ?? null,
    totalHigh: product.landed_total_1000_high ?? null,
  };

  const summary = fallbackSummary(product);
  const marketNotes = fallbackMarketNotes(product);
  const angle = fallbackAngle(product);

  const ukLow = product.amazon_uk_price_low != null ? Number(product.amazon_uk_price_low) : null;
  const ukHigh = product.amazon_uk_price_high != null ? Number(product.amazon_uk_price_high) : null;
  const caLow = product.amazon_ca_price_low != null ? Number(product.amazon_ca_price_low) : null;
  const caHigh = product.amazon_ca_price_high != null ? Number(product.amazon_ca_price_high) : null;
  const usLow = product.amazon_us_price_low != null ? Number(product.amazon_us_price_low) : null;
  const usHigh = product.amazon_us_price_high != null ? Number(product.amazon_us_price_high) : null;
  const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
  const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
  const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);
  const amazonMarketplace = amazonComparisonEnabled
    ? normalizeAmazonMarketplace(pickedCountry?.amazon_marketplace)
    : null;
  const amazonLow =
    amazonMarketplace === "US" ? usLow : amazonMarketplace === "CA" ? caLow : amazonMarketplace === "UK" ? ukLow : null;
  const amazonHigh =
    amazonMarketplace === "US" ? usHigh : amazonMarketplace === "CA" ? caHigh : amazonMarketplace === "UK" ? ukHigh : null;
  const amazonCurrency = amazonMarketplace ? marketplaceCurrency(amazonMarketplace) : "GBP";
  const hasAmazonComparison =
    amazonMarketplace === "US"
      ? hasUs
      : amazonMarketplace === "CA"
      ? hasCa
      : amazonMarketplace === "UK"
      ? hasUk
      : false;
  const amazonPriceRange = hasAmazonComparison ? formatAmazonPriceRange(amazonLow, amazonHigh, amazonCurrency) : null;

  const similarItems = similar;

  const trendingItems = mostViewed;

  return (
    <main className="min-h-screen bg-[#F5F6FA] text-neutral-900">
      <MarketingTopNav
        backgroundClassName="bg-white/95"
        borderClassName="border-transparent"
        dividerClassName="bg-[rgba(45,52,97,0.2)]"
        accentClassName="text-[#2D3461]"
        navTextClassName="text-neutral-600"
        navHoverClassName="hover:text-[#2D3461]"
        buttonBorderClassName="border-[rgba(45,52,97,0.2)]"
        buttonTextClassName="text-[#2D3461]"
        menuBorderClassName="border-[rgba(45,52,97,0.12)]"
        menuBgClassName="bg-white/95"
        menuTextClassName="text-neutral-700"
        menuHoverClassName="hover:text-[#2D3461]"
        disabledNavClassName="text-neutral-400"
      />

      <WhiteLabelViewTracker productId={product.id} source="marketing" />

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="mb-4 flex justify-end" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">{product.category}</p>
                <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{product.product_name}</h1>
                <p className="mt-3 text-sm text-neutral-600">{fallbackSeoDescription(product)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-700">
                {formatPerUnitRangeWithCurrency(landedPicked.perUnitLow, landedPicked.perUnitHigh, currency) || "Pricing pending"}
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-[22px] border border-neutral-200 bg-[#F2F3F5] p-4">
              {product.image_url ? (
                <img
                  src={cloudinaryTransform(product.image_url, 640)}
                  alt={`${product.product_name} white label idea`}
                  width={640}
                  height={640}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="h-[320px] w-full rounded-[18px] object-contain"
                />
              ) : (
                <div className="flex h-[320px] w-full items-center justify-center">
                  <div className="h-28 w-28 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-center">
                    <div className="pt-4 text-[10px] font-semibold text-emerald-700">YOUR LOGO</div>
                    <div className="mt-1 text-[12px] font-semibold text-neutral-700">
                      {slugify(product.product_name).slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-900">Business summary</h3>
                <p className="mt-2 text-sm text-neutral-600">{summary}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-900">Market notes</h3>
                <p className="mt-2 text-sm text-neutral-600">{marketNotes}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-900">White-label angle</h3>
                <p className="mt-2 text-sm text-neutral-600">{angle}</p>
              </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-neutral-900">Regulatory note</h3>
              <p className="mt-2 text-sm text-neutral-600">
                {formatRegulatoryNote(product.regulatory_note, countryIso2)}
              </p>
            </div>
            </div>

            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-[260px] flex-col gap-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800">
                  {landedPicked.totalLow != null || landedPicked.totalHigh != null
                    ? `${formatCurrency(landedPicked.totalLow, currency)}–${formatCurrency(
                        landedPicked.totalHigh,
                        currency
                      )} for 1,000 units`
                    : "Pricing pending"}
                </div>
                {amazonComparisonEnabled ? (
                  <div className="rounded-2xl border border-[rgba(45,52,97,0.22)] bg-gradient-to-br from-white via-white to-[rgba(45,52,97,0.10)] px-4 py-3 text-xs text-neutral-600 shadow-[0_14px_30px_rgba(45,52,97,0.16)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      Amazon price
                    </p>
                    <div className="mt-1 flex min-h-[70px] flex-col">
                      <p className="text-[11px] text-neutral-500">Amazon price available</p>
                      <div className="mt-2">
                        <span className="inline-flex rounded-full bg-[rgba(45,52,97,0.2)] px-4 py-1 text-[11px] font-semibold text-[rgba(45,52,97,0.55)] blur-sm">
                          £129.99–£199.99
                        </span>
                      </div>
                      <Link
                        href="/sign-in?next=/white-label/ideas"
                        className="mt-auto inline-flex text-[11px] font-semibold text-[#2D3461]"
                      >
                        Sign in to compare Amazon prices
                      </Link>
                    </div>
                  </div>
                ) : null}
                <Link href="/white-label" className="text-sm font-semibold text-neutral-500 hover:text-neutral-700">
                  Back to ideas
                </Link>
              </div>
              <Link
                href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(product.id))}&product_name=${encodeURIComponent(product.product_name)}&product_category=${encodeURIComponent(product.category)}&product_landed_ngn_per_unit=${encodeURIComponent(formatPerUnitRangeWithCurrency(landedPicked.perUnitLow, landedPicked.perUnitHigh, currency))}`}
                className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-[#2D3461] px-6 py-3 text-sm font-semibold text-white"
              >
                Start sourcing
              </Link>
            </div>
          </div>

          <div className="space-y-6">
            <DeferredSection>
              <div className="rounded-[26px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Similar in {product.category}</h3>
              <div className="mt-4 space-y-4">
                {similarItems.length ? (
                  similarItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/white-label/${item.slug || slugify(item.product_name)}`}
                      className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3"
                    >
                      <div className="h-14 w-14 overflow-hidden rounded-xl border border-neutral-200 bg-[#F2F3F5]">
                        {item.image_url ? (
                          <img
                            src={cloudinaryTransform(item.image_url, 160)}
                            alt={item.product_name}
                            width={160}
                            height={160}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-neutral-500">
                            WL
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-neutral-900">{item.product_name}</p>
                        <p className="text-xs text-neutral-500">
                        {formatPerUnitRangeWithCurrency(
                          item.landed_per_unit_low ?? null,
                          item.landed_per_unit_high ?? null,
                          currency
                        ) || "Pricing pending"}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500">More ideas coming soon in this category.</p>
                )}
              </div>
              </div>
            </DeferredSection>

            <DeferredSection>
              <div className="rounded-[26px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Most viewed ideas</h3>
              <div className="mt-4 space-y-4">
                {trendingItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/white-label/${item.slug || slugify(item.product_name)}`}
                  className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{item.product_name}</p>
                      <p className="text-xs text-neutral-500">{item.category}</p>
                    </div>
                    <span className="text-xs font-semibold text-neutral-500">{item.view_count || 0} views</span>
                  </Link>
                ))}
              </div>
              </div>
            </DeferredSection>
          </div>
        </div>
      </section>
    </main>
  );
}
