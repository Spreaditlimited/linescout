import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import { ensureWhiteLabelLandedCostTable } from "@/lib/white-label-landed";
import MarketingTopNav from "@/components/MarketingTopNav";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";
import FilterForm from "@/components/filters/FilterForm";
import WhiteLabelCountrySelector from "@/components/white-label/WhiteLabelCountrySelector";
import { currencyForCode } from "@/lib/white-label-country";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";
import { ensureWhiteLabelSettings } from "@/lib/white-label-access";
import { normalizeAmazonMarketplace, marketplaceCurrency } from "@/lib/white-label-marketplace";
import { getFxRate } from "@/lib/fx";
import { isKeepaMarketplaceSupported } from "@/lib/keepa";

export const runtime = "nodejs";
export const revalidate = 3600;
// Keep in sync with social preview assets.

const PAGE_SIZE = 20;
const BASE_URL = "https://linescout.sureimports.com";
const SOCIAL_IMAGE = `${BASE_URL}/white-label-social.png`;

function toAbsoluteImage(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

type SearchParams = {
  q?: string;
  category?: string;
  page?: string;
  price?: string;
  regulatory?: string;
  sort?: string;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const q = String(params?.q || "").trim();
  const category = String(params?.category || "").trim();
  let ogImage = SOCIAL_IMAGE;

  if (q || category) {
    const conn = await db.getConnection();
    try {
      const clauses = ["is_active = 1", "image_url IS NOT NULL", "TRIM(image_url) <> ''"];
      const args: any[] = [];
      if (category) {
        clauses.push("category = ?");
        args.push(category);
      }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        clauses.push(
          `(LOWER(product_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ? OR LOWER(COALESCE(why_sells,'')) LIKE ?)`
        );
        args.push(like, like, like, like);
      }
      const [rows]: any = await conn.query(
        `
        SELECT image_url
        FROM linescout_white_label_products
        WHERE ${clauses.join(" AND ")}
        ORDER BY id DESC
        LIMIT 1
        `,
        args
      );
      const picked = rows?.[0]?.image_url ? toAbsoluteImage(String(rows[0].image_url)) : null;
      if (picked) ogImage = picked;
    } finally {
      conn.release();
    }
  }

  const title = category
    ? `${category} White Label Ideas | LineScout`
    : q
    ? `White Label Ideas: ${q} | LineScout`
    : "White Label Product Ideas for Emerging Brands";

  const description = category
    ? `Explore ${category} white label ideas with pricing signals and sourcing guidance.`
    : q
    ? `Search results for “${q}” in white label product ideas.`
    : "Browse white label product ideas and activate sourcing with verified manufacturers in China.";

  const url = category
    ? `${BASE_URL}/white-label?category=${encodeURIComponent(category)}`
    : q
    ? `${BASE_URL}/white-label?q=${encodeURIComponent(q)}`
    : `${BASE_URL}/white-label`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "LineScout",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "White Label Product Ideas for Emerging Brands",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildPageHref(params: {
  q: string;
  category: string;
  page: number;
  price: string;
  regulatory: string;
  sort: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.price) qs.set("price", params.price);
  if (params.regulatory) qs.set("regulatory", params.regulatory);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/white-label?${query}` : "/white-label";
}

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

export default async function WhiteLabelPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const q = String(params?.q || "").trim();
  const category = String(params?.category || "").trim();
  const price = String(params?.price || "").trim();
  const regulatory = String(params?.regulatory || "").trim();
  const sort = String(params?.sort || "").trim();
  const requestedPage = toInt(params?.page, 1);
  const cookieStore = await cookies();
  const countryCookie = cookieStore.get("wl_country")?.value;

  const conn = await db.getConnection();
  let items: any[] = [];
  let total = 0;
  let categories: string[] = [];
  let mostViewed: any[] = [];
  let categorySpotlights: { category: string; items: any[] }[] = [];
  let countries: { id: number; name: string; iso2: string; default_currency_id?: number | null; settlement_currency_code?: string | null; amazon_marketplace?: string | null }[] = [];
  let countryOptions: { value: string; label: string }[] = [];
  let countryCode = "NG";
  let currencyCode = "NGN";
  let countryId = 0;
  let amazonComparisonEnabled = false;
  let pricingFallbackLabel: string | undefined;
  let effectivePrice = "";

  try {
    await ensureCountryConfig(conn);
    await ensureWhiteLabelSettings(conn);
    const lists = await listActiveCountriesAndCurrencies(conn);
    countries = (lists.countries || []) as typeof countries;
    const currencyById = new Map<number, string>(
      (lists.currencies || []).map((c: any) => [Number(c.id), String(c.code || "").toUpperCase()])
    );
    const picked = pickCountryFromCookie(countryCookie, countries);
    countryCode = picked?.iso2 ? String(picked.iso2).toUpperCase() : "NG";
    currencyCode = getCountryCurrencyCode(picked, currencyById);
    countryId = picked?.id ? Number(picked.id) : 0;
    countryOptions = countries.map((c) => ({ value: String(c.iso2 || "").toUpperCase(), label: c.name }));
    pricingFallbackLabel = picked?.name ? `No landed cost ranges yet for ${picked.name}.` : undefined;
    effectivePrice = currencyCode === "NGN" ? price : "";
    const [settingsRows]: any = await conn.query(
      `SELECT white_label_subscription_countries FROM linescout_settings ORDER BY id DESC LIMIT 1`
    );
    const eligible = new Set(parseEligibleCountries(settingsRows?.[0]?.white_label_subscription_countries));
    const normalizedMarketplace = normalizeAmazonMarketplace(picked?.amazon_marketplace);
    amazonComparisonEnabled =
      Boolean(countryCode) &&
      eligible.has(countryCode) &&
      Boolean(picked?.amazon_enabled) &&
      Boolean(normalizedMarketplace) &&
      isKeepaMarketplaceSupported(normalizedMarketplace);

    await ensureWhiteLabelProductsReady(conn);
    await ensureWhiteLabelLandedCostTable(conn);

    const clauses = ["p.is_active = 1"];
    const params: any[] = [];

    if (category) {
      clauses.push("p.category = ?");
      params.push(category);
    }

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      clauses.push(
        `(LOWER(p.product_name) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(COALESCE(p.short_desc,'')) LIKE ? OR LOWER(COALESCE(p.why_sells,'')) LIKE ?)`
      );
      params.push(like, like, like, like);
    }

    if (regulatory === "non_regulated") {
      clauses.push(
        `(LOWER(COALESCE(p.regulatory_note,'')) LIKE '%non-regulated%' OR LOWER(COALESCE(p.regulatory_note,'')) LIKE '%non regulated%')`
      );
    } else if (regulatory === "regulated") {
      clauses.push(
        `COALESCE(p.regulatory_note,'') <> '' AND LOWER(COALESCE(p.regulatory_note,'')) NOT LIKE '%non-regulated%' AND LOWER(COALESCE(p.regulatory_note,'')) NOT LIKE '%non regulated%'`
      );
    } else if (regulatory === "unknown") {
      clauses.push(`COALESCE(p.regulatory_note,'') = ''`);
    }

    if (effectivePrice) {
      if (price === "lt1k") {
        clauses.push(`lc.landed_per_unit_low IS NOT NULL AND lc.landed_per_unit_low < 1000`);
      } else if (price === "1k-3k") {
        clauses.push(`lc.landed_per_unit_low IS NOT NULL AND lc.landed_per_unit_low >= 1000 AND lc.landed_per_unit_low <= 3000`);
      } else if (price === "3k-7k") {
        clauses.push(`lc.landed_per_unit_low IS NOT NULL AND lc.landed_per_unit_low > 3000 AND lc.landed_per_unit_low <= 7000`);
      } else if (price === "7k-15k") {
        clauses.push(`lc.landed_per_unit_low IS NOT NULL AND lc.landed_per_unit_low > 7000 AND lc.landed_per_unit_low <= 15000`);
      } else if (price === "15kplus") {
        clauses.push(`lc.landed_per_unit_low IS NOT NULL AND lc.landed_per_unit_low > 15000`);
      }
    }

    const hasAmazonExpr = `(CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END)`;
    const sortKey = sort || "recommended";
    const orderBy =
      sortKey === "price_low"
        ? `ORDER BY (lc.landed_per_unit_low IS NULL) ASC, lc.landed_per_unit_low ASC, p.id DESC`
      : sortKey === "price_high"
        ? `ORDER BY (lc.landed_per_unit_low IS NULL) ASC, lc.landed_per_unit_low DESC, p.id DESC`
      : sortKey === "name"
        ? "ORDER BY p.product_name ASC, p.id DESC"
      : sortKey === "newest"
        ? "ORDER BY p.id DESC"
        : `ORDER BY ${hasAmazonExpr} DESC, COALESCE(v.views, 0) DESC, p.sort_order ASC, p.id DESC`;

    const [countRows]: any = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM linescout_white_label_products p
      LEFT JOIN linescout_white_label_landed_costs lc
        ON lc.product_id = p.id AND lc.country_id = ?
      WHERE ${clauses.join(" AND ")}
      `,
      [countryId, ...params]
    );
    total = Number(countRows?.[0]?.total || 0);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * PAGE_SIZE;

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
      WHERE ${clauses.join(" AND ")}
      ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [countryId, ...params, PAGE_SIZE, offset]
    );

    const preferredMarketplace = amazonComparisonEnabled ? normalizeAmazonMarketplace(picked?.amazon_marketplace) : null;
    const amazonCurrency = preferredMarketplace ? marketplaceCurrency(preferredMarketplace) : null;
    const amazonFx =
      preferredMarketplace && amazonCurrency
        ? currencyCode === amazonCurrency
          ? 1
          : await getFxRate(conn, currencyCode, amazonCurrency)
        : null;
    const ngnToDisplayFx =
      currencyCode === "NGN" ? 1 : await getFxRate(conn, "NGN", currencyCode);

    const mapItem = (r: any) => {
      let landedLow = r.landed_per_unit_low != null ? Number(r.landed_per_unit_low) : null;
      let landedHigh = r.landed_per_unit_high != null ? Number(r.landed_per_unit_high) : null;
      let landedTotalLow =
        r.landed_total_1000_low != null ? Number(r.landed_total_1000_low) : null;
      let landedTotalHigh =
        r.landed_total_1000_high != null ? Number(r.landed_total_1000_high) : null;

      const productLanded = pickProductLandedByCurrency(r, currencyCode);
      landedLow = landedLow ?? productLanded.low;
      landedHigh = landedHigh ?? productLanded.high;
      landedTotalLow = landedTotalLow ?? productLanded.totalLow;
      landedTotalHigh = landedTotalHigh ?? productLanded.totalHigh;

      if (landedLow == null || landedHigh == null || landedTotalLow == null || landedTotalHigh == null) {
        const computed = computeLandedRange({
          fob_low_usd: r.fob_low_usd,
          fob_high_usd: r.fob_high_usd,
          cbm_per_1000: r.cbm_per_1000,
        });
        if (currencyCode === "NGN") {
          landedLow = landedLow ?? computed.landed_ngn_per_unit_low;
          landedHigh = landedHigh ?? computed.landed_ngn_per_unit_high;
          landedTotalLow = landedTotalLow ?? computed.landed_ngn_total_1000_low;
          landedTotalHigh = landedTotalHigh ?? computed.landed_ngn_total_1000_high;
        } else if (ngnToDisplayFx && ngnToDisplayFx > 0) {
          landedLow =
            landedLow ??
            (computed.landed_ngn_per_unit_low != null
              ? Number(computed.landed_ngn_per_unit_low) * ngnToDisplayFx
              : null);
          landedHigh =
            landedHigh ??
            (computed.landed_ngn_per_unit_high != null
              ? Number(computed.landed_ngn_per_unit_high) * ngnToDisplayFx
              : null);
          landedTotalLow =
            landedTotalLow ??
            (computed.landed_ngn_total_1000_low != null
              ? Number(computed.landed_ngn_total_1000_low) * ngnToDisplayFx
              : null);
          landedTotalHigh =
            landedTotalHigh ??
            (computed.landed_ngn_total_1000_high != null
              ? Number(computed.landed_ngn_total_1000_high) * ngnToDisplayFx
              : null);
        }
      }

      const amazonLandedLow = landedLow != null && amazonFx ? landedLow * amazonFx : null;
      const amazonLandedHigh = landedHigh != null && amazonFx ? landedHigh * amazonFx : null;
      const ukLow = r.amazon_uk_price_low != null ? Number(r.amazon_uk_price_low) : null;
      const ukHigh = r.amazon_uk_price_high != null ? Number(r.amazon_uk_price_high) : null;
      const caLow = r.amazon_ca_price_low != null ? Number(r.amazon_ca_price_low) : null;
      const caHigh = r.amazon_ca_price_high != null ? Number(r.amazon_ca_price_high) : null;
      const usLow = r.amazon_us_price_low != null ? Number(r.amazon_us_price_low) : null;
      const usHigh = r.amazon_us_price_high != null ? Number(r.amazon_us_price_high) : null;
      const market = amazonComparisonEnabled ? preferredMarketplace : null;
      return {
        ...r,
        landed_per_unit_low: landedLow,
        landed_per_unit_high: landedHigh,
        landed_total_1000_low: landedTotalLow,
        landed_total_1000_high: landedTotalHigh,
        landed_currency_code: currencyCode,
        amazon_landed_per_unit_low: amazonLandedLow,
        amazon_landed_per_unit_high: amazonLandedHigh,
        amazon_display_marketplace: market,
        amazon_display_currency: market ? marketplaceCurrency(market) : null,
        amazon_display_price_low:
          market === "US" ? usLow : market === "CA" ? caLow : market === "UK" ? ukLow : null,
        amazon_display_price_high:
          market === "US" ? usHigh : market === "CA" ? caHigh : market === "UK" ? ukHigh : null,
        amazon_display_note: null,
      };
    };

    items = (rows || []).map(mapItem);

    const [catRows]: any = await conn.query(
      `
      SELECT DISTINCT category
      FROM linescout_white_label_products
      WHERE is_active = 1
      ORDER BY category ASC
      `
    );
    categories = (catRows || [])
      .map((r: any) => String(r.category || "").trim())
      .filter(Boolean);

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
      ORDER BY (CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END) DESC,
               view_count DESC, p.sort_order ASC, p.id DESC
      LIMIT 8
      `,
      [countryId]
    );
    mostViewed = (viewRows || []).map(mapItem);

    const [topCategoryRows]: any = await conn.query(
      `
      SELECT category, COUNT(*) AS total
      FROM linescout_white_label_products
      WHERE is_active = 1
      GROUP BY category
      ORDER BY total DESC, category ASC
      LIMIT 6
      `
    );

    for (const row of topCategoryRows || []) {
      const cat = String(row.category || "").trim();
      if (!cat) continue;
      const [catRowsItems]: any = await conn.query(
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
        WHERE p.is_active = 1 AND p.category = ?
        ORDER BY (CASE WHEN p.amazon_uk_price_low IS NOT NULL OR p.amazon_uk_price_high IS NOT NULL OR p.amazon_ca_price_low IS NOT NULL OR p.amazon_ca_price_high IS NOT NULL OR p.amazon_us_price_low IS NOT NULL OR p.amazon_us_price_high IS NOT NULL THEN 1 ELSE 0 END) DESC,
                 view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 4
        `,
        [countryId, cat]
      );

      const mapped = (catRowsItems || []).map(mapItem);

      if (mapped.length) {
        categorySpotlights.push({ category: cat, items: mapped });
      }
    }
  } finally {
    conn.release();
  }

  const currency = currencyForCode(currencyCode);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const categoryOptions = [{ value: "", label: "All categories" }].concat(
    categories.map((c) => ({ value: c, label: c }))
  );
  const priceOptions =
    currencyCode === "NGN"
      ? [
          { value: "", label: "Any budget" },
          { value: "lt1k", label: "Under ₦1,000" },
          { value: "1k-3k", label: "₦1,000 - ₦3,000" },
          { value: "3k-7k", label: "₦3,000 - ₦7,000" },
          { value: "7k-15k", label: "₦7,000 - ₦15,000" },
          { value: "15kplus", label: "₦15,000+" },
        ]
      : [{ value: "", label: "Any budget" }];
  const regulatoryOptions = [
    { value: "", label: "Any status" },
    { value: "non_regulated", label: "Non-regulated only" },
    { value: "regulated", label: "Regulated only" },
    { value: "unknown", label: "Unknown" },
  ];
  const sortOptions = [
    { value: "", label: "Recommended" },
    { value: "newest", label: "Newest" },
    { value: "price_low", label: "Price: Low to High" },
    { value: "price_high", label: "Price: High to Low" },
    { value: "name", label: "Name (A-Z)" },
  ];

  const brandBlue = "#2D3461";

  return (
    <main
      id="white-label-top"
      className="relative min-h-screen overflow-hidden bg-[#F5F6FA] text-neutral-900"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-180px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.18),transparent_65%)]" />
        <div className="absolute right-[-120px] top-[140px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.12),transparent_65%)]" />
        <div className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_70%)]" />
      </div>

      <div className="relative">
        <MarketingTopNav
          backgroundClassName="bg-white/95"
          borderClassName="border-transparent"
          dividerClassName="bg-[rgba(45,52,97,0.2)]"
          accentClassName="text-[var(--agent-blue)]"
          navTextClassName="text-neutral-600"
          navHoverClassName="hover:text-[var(--agent-blue)]"
          buttonBorderClassName="border-[rgba(45,52,97,0.2)]"
          buttonTextClassName="text-[var(--agent-blue)]"
          menuBorderClassName="border-[rgba(45,52,97,0.12)]"
          menuBgClassName="bg-white/95"
          menuTextClassName="text-neutral-700"
          menuHoverClassName="hover:text-[var(--agent-blue)]"
          disabledNavClassName="text-neutral-400"
        />

        {!category && !q && (
        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-6 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.15)] bg-[rgba(45,52,97,0.06)] px-4 py-1 text-xs font-semibold text-[var(--agent-blue)]">
              <Sparkles className="h-4 w-4" />
              White label product ideas
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
              Market-ready products you can brand and sell.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Explore white label ideas with pricing signals, categories, and demand notes. When you find a winner,
              start sourcing with verified China partners.
            </p>
            <div className="mt-6 flex flex-nowrap gap-3">
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)] whitespace-nowrap"
              >
                Start sourcing <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/white-label/start"
                className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-5 py-3 text-xs font-semibold text-[var(--agent-blue)] whitespace-nowrap"
              >
                Build a project brief
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-neutral-600">
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--agent-blue)]" />
                Verified factories
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                <BadgeCheck className="h-3.5 w-3.5 text-[var(--agent-blue)]" />
                Clear pricing signals
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                ~1,000 ideas coming
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="hero-float rounded-[26px] border border-neutral-200 bg-white p-2.5 shadow-[0_25px_60px_rgba(15,23,42,0.12)] sm:rounded-[32px] sm:p-4">
              <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-2 sm:rounded-[28px] sm:p-3">
                <Image
                  src="/white-label-hero.PNG"
                  alt="White label ideas preview"
                  width={520}
                  height={720}
                  className="h-auto w-full rounded-[16px] sm:rounded-[22px]"
                />
              </div>
            </div>
          </div>
        </section>
        )}

        <section className="mx-auto max-w-6xl px-6 pb-6">
          {!(q || category) ? (
            <FilterForm
              action="/white-label"
              searchPlaceholder="Search products, categories, or use cases"
              initial={{ q, category, price: effectivePrice, regulatory, sort }}
              categoryOptions={categoryOptions}
              priceOptions={priceOptions}
              regulatoryOptions={regulatoryOptions}
              sortOptions={sortOptions}
              gridColsClass="sm:grid-cols-2 lg:grid-cols-5"
              labels={{
                category: "Category",
                price: `Budget (landed per unit in ${currency.symbol})`,
                regulatory: "Regulatory",
                sort: "Sort by",
              }}
              clearHref="/white-label"
              countrySelector={<WhiteLabelCountrySelector value={countryCode} options={countryOptions} />}
              countryLabel="Country"
            />
          ) : (
            <div className="pt-6" />
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
            <div>
              Showing <span className="font-semibold text-neutral-900">{items.length}</span> of{" "}
              <span className="font-semibold text-neutral-900">{total}</span> ideas
            </div>
            {(q || category) && (
              <Link
                href="/white-label"
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
              >
                Back to all ideas
              </Link>
            )}
          </div>

          {!(q || category) && (
            <div className="mt-5">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildPageHref({
                    q,
                    category: "",
                    page: 1,
                    price: effectivePrice,
                    regulatory,
                    sort,
                  })}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    !category
                      ? "bg-[var(--agent-blue)] text-white"
                      : "border border-neutral-200 bg-white text-neutral-600"
                  }`}
                >
                  All
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c}
                    href={buildPageHref({
                      q,
                      category: c,
                      page: 1,
                      price: effectivePrice,
                      regulatory,
                      sort,
                    })}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      category === c
                        ? "bg-[var(--agent-blue)] text-white"
                        : "border border-neutral-200 bg-white text-neutral-600"
                    }`}
                  >
                    {c}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-10">
          <WhiteLabelCatalogClient
            items={items}
            detailBase="/white-label"
            currencyCode={currencyCode}
            amazonComparisonEnabled={amazonComparisonEnabled}
            lockAmazonComparison
            comparisonCtaHref="/sign-in?next=/white-label/ideas"
            comparisonCtaLabel="Sign in to compare Amazon prices"
            pricingFallbackLabel={pricingFallbackLabel}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildPageHref({
                  q,
                  category,
                  page: Math.max(1, page - 1),
                  price: effectivePrice,
                  regulatory,
                  sort,
                })}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  page === 1
                    ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-300"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900"
                }`}
                aria-disabled={page === 1}
              >
                Previous
              </Link>
              <Link
                href={buildPageHref({
                  q,
                  category,
                  page: Math.min(totalPages, page + 1),
                  price: effectivePrice,
                  regulatory,
                  sort,
                })}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  page >= totalPages
                    ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-300"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900"
                }`}
                aria-disabled={page >= totalPages}
              >
                Next
              </Link>
            </div>
          </div>
        </section>

        {mostViewed.length ? (
          <section className="mx-auto max-w-6xl px-6 pb-6">
            <div className="rounded-[26px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Most viewed</p>
                  <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Trending white label ideas</h2>
                </div>
                <Link href="/white-label" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
                  Explore all
                </Link>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {mostViewed.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href={`/white-label/${item.slug || slugify(item.product_name)}`}
                    className="group rounded-[22px] border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex h-32 items-center justify-center rounded-[18px] border border-neutral-200 bg-[#F2F3F5]">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.product_name} className="h-full w-full object-contain" />
                      ) : (
                        <div className="text-xs font-semibold text-neutral-500">YOUR LOGO</div>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-neutral-900">{item.product_name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.category}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {categorySpotlights.length ? (
          <section className="mx-auto max-w-6xl px-6 pb-6">
            <div className="space-y-6">
              {categorySpotlights.map((spot) => (
                <div
                  key={spot.category}
                  className="rounded-[26px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                        Category spotlight
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-neutral-900">{spot.category}</h3>
                    </div>
                    <Link
                      href={`${buildPageHref({
                        q: "",
                        category: spot.category,
                        page: 1,
                        price: "",
                        regulatory: "",
                        sort: "",
                      })}#white-label-top`}
                      className="text-xs font-semibold text-neutral-500 hover:text-neutral-700"
                    >
                      View category
                    </Link>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    {spot.items.map((item) => (
                      <Link
                        key={item.id}
                        href={`/white-label/${item.slug || slugify(item.product_name)}`}
                        className="group rounded-[22px] border border-neutral-200 bg-neutral-50 p-4"
                      >
                        <div className="flex h-28 items-center justify-center rounded-[18px] border border-neutral-200 bg-[#F2F3F5]">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.product_name} className="h-full w-full object-contain" />
                          ) : (
                            <div className="text-xs font-semibold text-neutral-500">YOUR LOGO</div>
                          )}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-neutral-900">{item.product_name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{item.category}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
