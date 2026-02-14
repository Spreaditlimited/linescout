import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Search, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsReady,
} from "@/lib/white-label-products";
import MarketingTopNav from "@/components/MarketingTopNav";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";

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
    : "White Label Product Ideas for Nigerian Brands";

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
          alt: "White Label Product Ideas for Nigerian Brands",
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

  const conn = await db.getConnection();
  let items: any[] = [];
  let total = 0;
  let categories: string[] = [];
  let mostViewed: any[] = [];
  let categorySpotlights: { category: string; items: any[] }[] = [];
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

    const sortKey = sort || "recommended";
    const orderBy =
      sortKey === "price_low"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} ASC, id DESC`
        : sortKey === "price_high"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} DESC, id DESC`
        : sortKey === "name"
        ? "ORDER BY product_name ASC, id DESC"
        : sortKey === "newest"
        ? "ORDER BY id DESC"
        : "ORDER BY sort_order ASC, id DESC";

    const [countRows]: any = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM linescout_white_label_products
      WHERE ${clauses.join(" AND ")}
      `,
      params
    );
    total = Number(countRows?.[0]?.total || 0);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * PAGE_SIZE;

    const [rows]: any = await conn.query(
      `
      SELECT *
      FROM linescout_white_label_products
      WHERE ${clauses.join(" AND ")}
      ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, PAGE_SIZE, offset]
    );

    items = (rows || []).map((r: any) => ({
      ...r,
      ...computeLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_1000: r.cbm_per_1000,
      }),
    }));

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
      LIMIT 8
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
        SELECT p.*, COALESCE(v.views, 0) AS view_count
        FROM linescout_white_label_products p
        LEFT JOIN (
          SELECT product_id, COUNT(*) AS views
          FROM linescout_white_label_views
          GROUP BY product_id
        ) v ON v.product_id = p.id
        WHERE p.is_active = 1 AND p.category = ?
        ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
        LIMIT 4
        `,
        [cat]
      );

      const mapped = (catRowsItems || []).map((r: any) => ({
        ...r,
        ...computeLandedRange({
          fob_low_usd: r.fob_low_usd,
          fob_high_usd: r.fob_high_usd,
          cbm_per_1000: r.cbm_per_1000,
        }),
      }));

      if (mapped.length) {
        categorySpotlights.push({ category: cat, items: mapped });
      }
    }
  } finally {
    conn.release();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const selectClass =
    "w-full appearance-none rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm focus:outline-none focus:border-[rgba(45,52,97,0.45)] focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]";

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
                href="/sourcing-project?route_type=white_label"
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
            <form method="GET" action="/white-label" className="rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
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
                  <Link href="/white-label" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
                    Clear filters
                  </Link>
                </div>
              )}
            </form>
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
          )}
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-10">
          <WhiteLabelCatalogClient items={items} detailBase="/white-label" />

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
