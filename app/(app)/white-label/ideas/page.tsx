import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsReady,
} from "@/lib/white-label-products";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";
import MarketingEventTracker from "@/components/marketing/MarketingEventTracker";

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

  const conn = await db.getConnection();
  let items: any[] = [];
  let total = 0;
  let categories: string[] = [];
  let mostViewed: any[] = [];
  try {
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

    if (price) {
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const selectClass =
    "w-full appearance-none rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm focus:outline-none focus:border-[rgba(45,52,97,0.45)] focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]";

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

      <div className="mt-6 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <form method="GET" action="/white-label/ideas">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search products, categories, or use cases"
                className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-[var(--agent-blue)] px-5 py-3 text-xs font-semibold text-white"
            >
              Search
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Category</label>
              <div className="relative">
                <select name="category" defaultValue={category} className={selectClass}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  ▾
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Budget (landed per unit in ₦)</label>
              <div className="relative">
                <select name="price" defaultValue={price} className={selectClass}>
                  <option value="">Any budget</option>
                  <option value="lt1k">Under ₦1,000</option>
                  <option value="1k-3k">₦1,000 - ₦3,000</option>
                  <option value="3k-7k">₦3,000 - ₦7,000</option>
                  <option value="7k-15k">₦7,000 - ₦15,000</option>
                  <option value="15kplus">₦15,000+</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  ▾
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Regulatory</label>
              <div className="relative">
                <select name="regulatory" defaultValue={regulatory} className={selectClass}>
                  <option value="">Any status</option>
                  <option value="non_regulated">Non-regulated only</option>
                  <option value="regulated">Regulated only</option>
                  <option value="unknown">Unknown</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  ▾
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Sort by</label>
              <div className="relative">
                <select name="sort" defaultValue={sort} className={selectClass}>
                  <option value="">Recommended</option>
                  <option value="newest">Newest</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="name">Name (A-Z)</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  ▾
                </span>
              </div>
            </div>
          </div>

            {(q || category || price || regulatory || sort) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href="/white-label/ideas" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
                  Clear filters
                </Link>
              </div>
            )}
        </form>
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
              price,
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
                  price,
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
        <WhiteLabelCatalogClient items={items} detailBase="/white-label/ideas" />

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
                  price,
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
                  price,
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
