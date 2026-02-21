import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import FilterForm from "@/components/filters/FilterForm";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsReady,
} from "@/lib/white-label-products";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";
import MarketingEventTracker from "@/components/marketing/MarketingEventTracker";
import WhiteLabelCountrySelector from "@/components/white-label/WhiteLabelCountrySelector";
import { currencyForCode } from "@/lib/white-label-country";
import { ensureCountryConfig, listActiveCountriesAndCurrencies } from "@/lib/country-config";

export const runtime = "nodejs";
export const revalidate = 3600;

const PAGE_SIZE = 20;
const FX_RATE_NGN = 1500;
const CBM_RATE_NGN = 450000;
const MARKUP = 0.2;
const LANDED_LOW_MULTIPLIER = 0.5;
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
        ORDER BY sort_order ASC, id DESC
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
    : "White Label Ideas | LineScout";

  const description = category
    ? `Explore ${category} white label ideas with pricing signals and sourcing guidance.`
    : q
    ? `Search results for “${q}” in white label product ideas.`
    : "Browse white label product ideas and start a sourcing project when you are ready.";

  const url = category
    ? `${BASE_URL}/white-label/ideas?category=${encodeURIComponent(category)}`
    : q
    ? `${BASE_URL}/white-label/ideas?q=${encodeURIComponent(q)}`
    : `${BASE_URL}/white-label/ideas`;

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
          alt: "White Label Ideas by LineScout",
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
  return query ? `/white-label/ideas?${query}` : "/white-label/ideas";
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
  countries: { id: number; name: string; iso2: string; default_currency_id?: number | null; settlement_currency_code?: string | null }[]
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
  const allowed = new Set(["NGN", "GBP", "CAD"]);
  const candidate = String(fromDefault || country.settlement_currency_code || "NGN").toUpperCase();
  if (allowed.has(candidate)) return candidate;
  const settlement = String(country.settlement_currency_code || "NGN").toUpperCase();
  return allowed.has(settlement) ? settlement : "NGN";
}

export default async function WhiteLabelIdeasPage({
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
  let countries: { id: number; name: string; iso2: string; default_currency_id?: number | null; settlement_currency_code?: string | null }[] = [];
  let countryOptions: { value: string; label: string }[] = [];
  let countryCode = "NG";
  let currencyCode = "NGN";
  try {
    await ensureCountryConfig(conn);
    const lists = await listActiveCountriesAndCurrencies(conn);
    countries = (lists.countries || []) as typeof countries;
    const currencyById = new Map<number, string>(
      (lists.currencies || []).map((c: any) => [Number(c.id), String(c.code || "").toUpperCase()])
    );
    const picked = pickCountryFromCookie(countryCookie, countries);
    countryCode = picked?.iso2 ? String(picked.iso2).toUpperCase() : "NG";
    currencyCode = getCountryCurrencyCode(picked, currencyById);
    countryOptions = countries.map((c) => ({ value: String(c.iso2 || "").toUpperCase(), label: c.name }));

    await ensureWhiteLabelProductsReady(conn);

    const clauses = ["is_active = 1"];
    const params: any[] = [];

    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      clauses.push(
        `(LOWER(product_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ? OR LOWER(COALESCE(why_sells,'')) LIKE ?)`
      );
      params.push(like, like, like, like);
    }

    if (regulatory === "non_regulated") {
      clauses.push(
        `(LOWER(COALESCE(regulatory_note,'')) LIKE '%non-regulated%' OR LOWER(COALESCE(regulatory_note,'')) LIKE '%non regulated%')`
      );
    } else if (regulatory === "regulated") {
      clauses.push(
        `COALESCE(regulatory_note,'') <> '' AND LOWER(COALESCE(regulatory_note,'')) NOT LIKE '%non-regulated%' AND LOWER(COALESCE(regulatory_note,'')) NOT LIKE '%non regulated%'`
      );
    } else if (regulatory === "unknown") {
      clauses.push(`COALESCE(regulatory_note,'') = ''`);
    }

    const landedLowExpr = `(${LANDED_LOW_MULTIPLIER} * ((COALESCE(fob_low_usd,0) * ${FX_RATE_NGN}) + (COALESCE(cbm_per_1000,0) * ${CBM_RATE_NGN} / 1000)) * (1 + ${MARKUP}))`;
    const effectivePrice = currencyCode === "NGN" ? price : "";

    if (effectivePrice) {
      if (price === "lt1k") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} < 1000`);
      } else if (price === "1k-3k") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} >= 1000 AND ${landedLowExpr} <= 3000`);
      } else if (price === "3k-7k") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 3000 AND ${landedLowExpr} <= 7000`);
      } else if (price === "7k-15k") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 7000 AND ${landedLowExpr} <= 15000`);
      } else if (price === "15kplus") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 15000`);
      }
    }

    const sortClause =
      sort === "price_low"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} ASC, id DESC`
        : sort === "price_high"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} DESC, id DESC`
        : sort === "name"
        ? "ORDER BY product_name ASC, id DESC"
        : sort === "newest"
        ? "ORDER BY id DESC"
        : "ORDER BY id DESC";

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT SQL_CALC_FOUND_ROWS *
      FROM linescout_white_label_products
      ${where}
      ${sortClause}
      LIMIT ? OFFSET ?
      `,
      [...params, PAGE_SIZE, (requestedPage - 1) * PAGE_SIZE]
    );
    const [totalRows]: any = await conn.query(`SELECT FOUND_ROWS() as total`);

    items = (rows || []).map((r: any) => ({
      ...r,
      ...computeLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_1000: r.cbm_per_1000,
      }),
    }));
    total = Number(totalRows?.[0]?.total || 0);

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
      SELECT p.*, COALESCE(v.views, 0) AS view_count
      FROM linescout_white_label_products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE p.is_active = 1
      ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
      LIMIT 4
      `
    );

    mostViewed = (viewRows || []).map((r: any) => ({
      ...r,
      ...computeLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_1000: r.cbm_per_1000,
      }),
    }));
  } finally {
    conn.release();
  }

  const currency = currencyForCode(currencyCode);
  const effectivePrice = currencyCode === "NGN" ? price : "";
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

  return (
    <div className="px-6 py-10">
      <MarketingEventTracker eventType="white_label_view" />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
          White Label Ideas
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900">Browse product ideas</h1>
        <p className="text-sm text-neutral-600">
          Search, filter, and shortlist white label products before starting a sourcing project.
        </p>
      </div>

      <div className="mt-6">
        <FilterForm
          action="/white-label/ideas"
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
          clearHref="/white-label/ideas"
          countrySelector={<WhiteLabelCountrySelector value={countryCode} options={countryOptions} />}
          countryLabel="Country"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
        <div>
          Showing <span className="font-semibold text-neutral-900">{items.length}</span> of{" "}
          <span className="font-semibold text-neutral-900">{total}</span> ideas
        </div>
      </div>

      {mostViewed.length ? (
        <div className="mt-6 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Most viewed</p>
              <h2 className="mt-1 text-lg font-semibold text-neutral-900">Trending ideas right now</h2>
            </div>
            <Link href="/white-label/ideas" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
              See all
            </Link>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {mostViewed.map((item) => (
              <Link
                key={item.id}
                href={`/white-label/ideas/${item.slug || slugify(item.product_name)}`}
                className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-3"
              >
                <div className="flex h-24 items-center justify-center rounded-[16px] border border-neutral-200 bg-[#F2F3F5]">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-xs font-semibold text-neutral-500">YOUR LOGO</div>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-neutral-900">{item.product_name}</p>
                <p className="text-xs text-neutral-500">{item.category}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
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

      <div className="mt-6">
      <WhiteLabelCatalogClient items={items} detailBase="/white-label/ideas" currencyCode={currencyCode} />

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
      </div>
    </div>
  );
}
