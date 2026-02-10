import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Search, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import {
  computeLandedRange,
  ensureWhiteLabelProductsTable,
  seedWhiteLabelProducts,
} from "@/lib/white-label-products";
import MarketingTopNav from "@/components/MarketingTopNav";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  category?: string;
  page?: string;
  price?: string;
  regulatory?: string;
  has_image?: string;
  sort?: string;
};

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
  has_image: string;
  sort: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.price) qs.set("price", params.price);
  if (params.regulatory) qs.set("regulatory", params.regulatory);
  if (params.has_image) qs.set("has_image", params.has_image);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/white-label?${query}` : "/white-label";
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
  const hasImage = String(params?.has_image || "").trim();
  const sort = String(params?.sort || "").trim();
  const requestedPage = toInt(params?.page, 1);

  const conn = await db.getConnection();
  let items: any[] = [];
  let total = 0;
  let categories: string[] = [];
  try {
    await ensureWhiteLabelProductsTable(conn);
    await seedWhiteLabelProducts(conn);

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

    if (hasImage === "1") {
      clauses.push("COALESCE(image_url, '') <> ''");
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

    if (price) {
      if (price === "lt1") {
        clauses.push("fob_low_usd IS NOT NULL AND fob_low_usd < 1");
      } else if (price === "1-3") {
        clauses.push("fob_low_usd IS NOT NULL AND fob_low_usd >= 1 AND fob_low_usd <= 3");
      } else if (price === "3-7") {
        clauses.push("fob_low_usd IS NOT NULL AND fob_low_usd > 3 AND fob_low_usd <= 7");
      } else if (price === "7-15") {
        clauses.push("fob_low_usd IS NOT NULL AND fob_low_usd > 7 AND fob_low_usd <= 15");
      } else if (price === "15plus") {
        clauses.push("fob_low_usd IS NOT NULL AND fob_low_usd > 15");
      }
    }

    const sortKey = sort || "recommended";
    const orderBy =
      sortKey === "price_low"
        ? "ORDER BY (fob_low_usd IS NULL) ASC, fob_low_usd ASC, id DESC"
        : sortKey === "price_high"
        ? "ORDER BY (fob_low_usd IS NULL) ASC, fob_low_usd DESC, id DESC"
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
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/sourcing-project?route_type=white_label"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
              >
                Start sourcing <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/white-label/start"
                className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
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

        <section className="mx-auto max-w-6xl px-6 pb-6">
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
                <label className="text-xs font-semibold text-neutral-600">Budget (FOB per unit)</label>
                <div className="relative">
                  <select name="price" defaultValue={price} className={selectClass}>
                    <option value="">Any budget</option>
                    <option value="lt1">Under $1</option>
                    <option value="1-3">$1 - $3</option>
                    <option value="3-7">$3 - $7</option>
                    <option value="7-15">$7 - $15</option>
                    <option value="15plus">$15+</option>
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

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-neutral-600">Images</label>
              <div className="relative">
                <select name="has_image" defaultValue={hasImage} className={selectClass}>
                  <option value="">All ideas</option>
                  <option value="1">Only with images</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  ▾
                </span>
              </div>

              {(q || category || price || regulatory || hasImage || sort) && (
                <Link href="/white-label" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
                  Clear filters
                </Link>
              )}
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
            <div>
              Showing <span className="font-semibold text-neutral-900">{items.length}</span> of{" "}
              <span className="font-semibold text-neutral-900">{total}</span> ideas
            </div>
          </div>

          <div className="mt-5">
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildPageHref({
                  q,
                  category: "",
                  page: 1,
                  price,
                  regulatory,
                  has_image: hasImage,
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
                    has_image: hasImage,
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
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-10">
          <WhiteLabelCatalogClient items={items} />

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
                  has_image: hasImage,
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
                  has_image: hasImage,
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
      </div>
    </main>
  );
}
