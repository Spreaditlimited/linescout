import Link from "next/link";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WhiteLabelProductGuide from "@/components/white-label/WhiteLabelProductGuide";
import { db } from "@/lib/db";
import { computeLandedRange } from "@/lib/white-label-products";
import { currencyForCode, formatCurrency, pickLandedFieldsByCurrency } from "@/lib/white-label-country";
import { listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { marketplaceCurrency, normalizeAmazonMarketplace } from "@/lib/white-label-marketplace";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";
import { getFxRate } from "@/lib/fx";
import { getWhiteLabelSeoContent } from "@/data/white-label-seo-content";
import { parseWhiteLabelSeoContent } from "@/lib/white-label-seo-types";

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
  seo_content_json?: unknown;
  seo_content_updated_at?: string | Date | null;
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

function resolvedSeoContent(product: ProductRow, pageSlug: string) {
  return parseWhiteLabelSeoContent(product.seo_content_json) || getWhiteLabelSeoContent(pageSlug);
}

const fetchProduct = cache(async (slug: string) => {
  const conn = await db.getConnection();
  try {
    const [rows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count,
             (
               SELECT revision.content_json
               FROM linescout_white_label_seo_revisions revision
               WHERE revision.product_id = p.id AND revision.status = 'published'
               ORDER BY revision.version DESC
               LIMIT 1
             ) AS seo_content_json,
             (
               SELECT revision.updated_at
               FROM linescout_white_label_seo_revisions revision
               WHERE revision.product_id = p.id AND revision.status = 'published'
               ORDER BY revision.version DESC
               LIMIT 1
             ) AS seo_content_updated_at
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
});

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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

  const pageSlug = product.slug || slugify(product.product_name);
  const url = `${BASE_URL}/white-label/${pageSlug}`;
  const seoContent = resolvedSeoContent(product, pageSlug);
  const title = seoContent?.seoTitle || product.seo_title || `${product.product_name} | White Label Idea`;
  const description = seoContent?.seoDescription || fallbackSeoDescription(product);

  return {
    title,
    description,
    keywords: seoContent?.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "LineScout",
      images: product.image_url
        ? [{ url: product.image_url, alt: `${product.product_name} private label sourcing guide` }]
        : undefined,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.image_url ? [product.image_url] : undefined,
    },
    robots: { index: true, follow: true },
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

    const [rows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count,
             (
               SELECT revision.content_json
               FROM linescout_white_label_seo_revisions revision
               WHERE revision.product_id = p.id AND revision.status = 'published'
               ORDER BY revision.version DESC
               LIMIT 1
             ) AS seo_content_json,
             (
               SELECT revision.updated_at
               FROM linescout_white_label_seo_revisions revision
               WHERE revision.product_id = p.id AND revision.status = 'published'
               ORDER BY revision.version DESC
               LIMIT 1
             ) AS seo_content_updated_at,
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
    const categorySimilar = (similarRows || []).map(withLanded);
    const editorialSlugs =
      resolvedSeoContent(product, product.slug || slugify(product.product_name))?.relatedSlugs || [];
    let editorialSimilar: ProductRow[] = [];
    if (editorialSlugs.length) {
      const placeholders = editorialSlugs.map(() => "?").join(", ");
      const orderPlaceholders = editorialSlugs.map(() => "?").join(", ");
      const [editorialRows]: any = await conn.query(
        `SELECT p.*, COALESCE(v.views, 0) AS view_count,
                lc.freight_per_unit, lc.landed_per_unit_low, lc.landed_per_unit_high,
                lc.landed_total_1000_low, lc.landed_total_1000_high
         FROM linescout_white_label_products p
         LEFT JOIN linescout_white_label_landed_costs lc
           ON lc.product_id = p.id AND lc.country_id = ?
         LEFT JOIN (
           SELECT product_id, COUNT(*) AS views
           FROM linescout_white_label_views
           GROUP BY product_id
         ) v ON v.product_id = p.id
         WHERE p.slug IN (${placeholders}) AND p.is_active = 1
         ORDER BY FIELD(p.slug, ${orderPlaceholders})`,
        [countryId, ...editorialSlugs, ...editorialSlugs],
      );
      editorialSimilar = (editorialRows || []).map(withLanded);
    }
    const seenRelated = new Set<number>();
    similar = [...editorialSimilar, ...categorySimilar]
      .filter((item) => {
        if (seenRelated.has(Number(item.id))) return false;
        seenRelated.add(Number(item.id));
        return true;
      })
      .slice(0, 6);

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

  const pageSlug = product.slug || slugify(product.product_name);
  const seoContent = resolvedSeoContent(product, pageSlug);
  const canonicalUrl = `${BASE_URL}/white-label/${pageSlug}`;

  const landedPicked = {
    perUnitLow: product.landed_per_unit_low ?? null,
    perUnitHigh: product.landed_per_unit_high ?? null,
    totalLow: product.landed_total_1000_low ?? null,
    totalHigh: product.landed_total_1000_high ?? null,
  };

  const summary = seoContent?.businessSummary || fallbackSummary(product);
  const marketNotes = seoContent?.marketNotes || fallbackMarketNotes(product);
  const angle = seoContent?.whiteLabelAngle || fallbackAngle(product);

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

  const sourcingHref = `/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(
    String(product.id)
  )}&product_name=${encodeURIComponent(product.product_name)}&product_category=${encodeURIComponent(
    product.category
  )}&product_landed_ngn_per_unit=${encodeURIComponent(
    formatPerUnitRangeWithCurrency(landedPicked.perUnitLow, landedPicked.perUnitHigh, currency)
  )}`;

  const jsonLd = seoContent
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
              { "@type": "ListItem", position: 2, name: "White Label Ideas", item: `${BASE_URL}/white-label` },
              { "@type": "ListItem", position: 3, name: product.product_name, item: canonicalUrl },
            ],
          },
          {
            "@type": "Article",
            "@id": `${canonicalUrl}#guide`,
            headline: seoContent.seoTitle,
            description: seoContent.seoDescription,
            image: product.image_url || undefined,
            mainEntityOfPage: canonicalUrl,
            dateModified: product.seo_content_updated_at
              ? new Date(product.seo_content_updated_at).toISOString()
              : undefined,
            about: {
              "@type": "Thing",
              name: product.product_name,
              description: seoContent.introduction,
            },
            author: { "@type": "Organization", name: "LineScout by Sure Imports", url: BASE_URL },
            publisher: { "@type": "Organization", name: "LineScout by Sure Imports", url: BASE_URL },
          },
          {
            "@type": "FAQPage",
            "@id": `${canonicalUrl}#faq`,
            mainEntity: seoContent.faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <WhiteLabelProductGuide
        product={product}
        seoContent={seoContent}
        summary={summary}
        marketNotes={marketNotes}
        angle={angle}
        regulatoryNote={formatRegulatoryNote(product.regulatory_note, countryIso2)}
        currencyCode={currencyCode}
        sourcingHref={sourcingHref}
        amazonComparisonEnabled={amazonComparisonEnabled}
        amazonPriceRange={amazonPriceRange}
        similarItems={similarItems}
        popularItems={trendingItems}
      />
    </>
  );
}
