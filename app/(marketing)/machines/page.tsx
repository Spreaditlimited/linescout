import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Sparkles, Settings } from "lucide-react";
import { db } from "@/lib/db";
import MarketingTopNav from "@/components/MarketingTopNav";
import MachinesCatalogClient from "@/components/machines/MachinesCatalogClient";
import { computeMachineLandedRange, ensureMachinesReady, getMachinePricingSettings } from "@/lib/machines";

export const runtime = "nodejs";
export const revalidate = 3600;

const PAGE_SIZE = 20;
const BASE_URL = "https://linescout.sureimports.com";
const SOCIAL_IMAGE = `${BASE_URL}/linescout-social.PNG`;

type SearchParams = {
  q?: string;
  category?: string;
  page?: string;
  price?: string;
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
  sort: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.price) qs.set("price", params.price);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/machines?${query}` : "/machines";
}

function toAbsoluteImage(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

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
          `(LOWER(machine_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ? OR LOWER(COALESCE(why_sells,'')) LIKE ? OR LOWER(COALESCE(processing_stage,'')) LIKE ?)`
        );
        args.push(like, like, like, like, like);
      }
      const [rows]: any = await conn.query(
        `
        SELECT image_url
        FROM linescout_machines
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
    ? `${category} Machines & Lines | LineScout`
    : q
    ? `Agro Machines: ${q} | LineScout`
    : "Agro Processing Machines & Production Lines | LineScout";

  const description = category
    ? `Explore ${category} machines and production lines with landed cost estimates in Lagos.`
    : q
    ? `Search results for “${q}” in agro processing machines and production lines.`
    : "Find agro processing machines and production lines with pricing signals and sourcing guidance.";

  const url = category
    ? `${BASE_URL}/machines?category=${encodeURIComponent(category)}`
    : q
    ? `${BASE_URL}/machines?q=${encodeURIComponent(q)}`
    : `${BASE_URL}/machines`;

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
          alt: "Agro processing machines by LineScout",
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

export default async function MachinesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const q = String(params?.q || "").trim();
  const category = String(params?.category || "").trim();
  const price = String(params?.price || "").trim();
  const sort = String(params?.sort || "").trim();
  const requestedPage = toInt(params?.page, 1);

  const conn = await db.getConnection();
  let items: any[] = [];
  let total = 0;
  let categories: string[] = [];
  let pricing = await getMachinePricingSettings(conn);
  try {
    await ensureMachinesReady(conn);

    const clauses = ["is_active = 1"];
    const args: any[] = [];

    if (category) {
      clauses.push("category = ?");
      args.push(category);
    }

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      clauses.push(
        `(LOWER(machine_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(short_desc,'')) LIKE ? OR LOWER(COALESCE(why_sells,'')) LIKE ? OR LOWER(COALESCE(processing_stage,'')) LIKE ?)`
      );
      args.push(like, like, like, like, like);
    }

    const landedLowExpr = `((COALESCE(fob_low_usd,0) * ${pricing.exchange_rate_usd}) + (COALESCE(cbm_per_unit,0) * ${pricing.cbm_rate_ngn})) * (1 + ${pricing.markup_percent})`;

    if (price) {
      if (price === "lt1m") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} < 1000000`);
      } else if (price === "1m-5m") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} >= 1000000 AND ${landedLowExpr} <= 5000000`);
      } else if (price === "5m-15m") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 5000000 AND ${landedLowExpr} <= 15000000`);
      } else if (price === "15m-30m") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 15000000 AND ${landedLowExpr} <= 30000000`);
      } else if (price === "30mplus") {
        clauses.push(`fob_low_usd IS NOT NULL AND ${landedLowExpr} > 30000000`);
      }
    }

    const sortClause =
      sort === "price_low"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} ASC, id DESC`
        : sort === "price_high"
        ? `ORDER BY (fob_low_usd IS NULL) ASC, ${landedLowExpr} DESC, id DESC`
        : sort === "name"
        ? "ORDER BY machine_name ASC, id DESC"
        : sort === "newest"
        ? "ORDER BY id DESC"
        : "ORDER BY sort_order ASC, id DESC";

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const [rows]: any = await conn.query(
      `
      SELECT SQL_CALC_FOUND_ROWS *
      FROM linescout_machines
      ${where}
      ${sortClause}
      LIMIT ? OFFSET ?
      `,
      [...args, PAGE_SIZE, (requestedPage - 1) * PAGE_SIZE]
    );
    const [totalRows]: any = await conn.query(`SELECT FOUND_ROWS() as total`);

    items = (rows || []).map((r: any) => ({
      ...r,
      ...computeMachineLandedRange({
        fob_low_usd: r.fob_low_usd,
        fob_high_usd: r.fob_high_usd,
        cbm_per_unit: r.cbm_per_unit,
        exchange_rate_usd: pricing.exchange_rate_usd,
        cbm_rate_ngn: pricing.cbm_rate_ngn,
        markup_percent: pricing.markup_percent,
      }),
    }));
    total = Number(totalRows?.[0]?.total || 0);

    const [catRows]: any = await conn.query(
      `
      SELECT DISTINCT category
      FROM linescout_machines
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
      id="machines-top"
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
                Agro machines & production lines
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
                Machines Nigerians buy to scale agro processing.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
                Browse small and medium agro processing machines and complete production lines. View landed cost
                estimates for Lagos and start sourcing with verified China manufacturers.
              </p>
              <div className="mt-6 flex flex-nowrap gap-3">
                <Link
                  href="/sourcing-project?route_type=machine_sourcing"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)] whitespace-nowrap"
                >
                  Start sourcing <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-5 py-3 text-xs font-semibold text-[var(--agent-blue)] whitespace-nowrap"
                >
                  Talk to LineScout
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 text-xs text-neutral-600">
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--agent-blue)]" />
                  Verified manufacturers
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                  <Settings className="h-3.5 w-3.5 text-[var(--agent-blue)]" />
                  Small & medium capacity
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
                  Landed cost estimate (Lagos, sea)
                </span>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                For industrial and fully automated lines, chat with the LineScout team.
              </p>
            </div>
            <div className="relative">
              <div className="hero-float rounded-[26px] border border-neutral-200 bg-white p-2.5 shadow-[0_25px_60px_rgba(15,23,42,0.12)] sm:rounded-[32px] sm:p-4">
                <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-2 sm:rounded-[28px] sm:p-3">
                  <Image
                    src="/hero.png"
                    alt="Agro processing machines preview"
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
            <form method="GET" action="/machines" className="rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
                  <Search className="h-4 w-4 text-neutral-400" />
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Search machines, lines, or processes"
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
                  <label className="text-xs font-semibold text-neutral-600">Budget (landed in ₦)</label>
                  <div className="relative">
                    <select name="price" defaultValue={price} className={selectClass}>
                      <option value="">Any budget</option>
                      <option value="lt1m">Under ₦1,000,000</option>
                      <option value="1m-5m">₦1,000,000 - ₦5,000,000</option>
                      <option value="5m-15m">₦5,000,000 - ₦15,000,000</option>
                      <option value="15m-30m">₦15,000,000 - ₦30,000,000</option>
                      <option value="30mplus">₦30,000,000+</option>
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

              {(q || category || price || sort) && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link href="/machines" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
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
              <span className="font-semibold text-neutral-900">{total}</span> machines
            </div>
            {(q || category) && (
              <Link
                href="/machines"
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
              >
                Back to all machines
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
          <MachinesCatalogClient items={items} detailBase="/machines" />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildPageHref({
                  q,
                  category,
                  page: Math.max(page - 1, 1),
                  price,
                  sort,
                })}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600"
              >
                Previous
              </Link>
              <Link
                href={buildPageHref({
                  q,
                  category,
                  page: Math.min(page + 1, totalPages),
                  price,
                  sort,
                })}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600"
              >
                Next
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Estimated landed cost in Lagos using sea freight. Last‑mile delivery not included.
          </p>
        </section>
      </div>
    </main>
  );
}
