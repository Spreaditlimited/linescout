import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Settings } from "lucide-react";
import { db } from "@/lib/db";
import MachinesCatalogClient from "@/components/machines/MachinesCatalogClient";
import { computeMachineLandedRange, getMachinePricingSettings } from "@/lib/machines";
import FilterForm from "@/components/filters/FilterForm";
import {
  LINESCOUT_SOCIAL_IMAGE,
  LINESCOUT_SOCIAL_IMAGE_METADATA,
} from "@/lib/linescout-metadata";

export const runtime = "nodejs";
export const revalidate = 3600;

const PAGE_SIZE = 20;
const BASE_URL = "https://linescout.sureimports.com";

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

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const q = String(params?.q || "").trim();
  const category = String(params?.category || "").trim();

  const title = category
    ? `${category} Machines & Lines | LineScout`
    : q
    ? `Agro Machines: ${q} | LineScout`
    : "Agro Processing Machines & Production Lines | LineScout";

  const description = category
    ? `Explore ${category} machines and production lines with landed cost estimates for your market.`
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
      images: [LINESCOUT_SOCIAL_IMAGE_METADATA],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [LINESCOUT_SOCIAL_IMAGE],
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
  const categoryOptions = [{ value: "", label: "All categories" }].concat(
    categories.map((c) => ({ value: c, label: c }))
  );
  const priceOptions = [
    { value: "", label: "Any budget" },
    { value: "lt1m", label: "Under ₦1,000,000" },
    { value: "1m-5m", label: "₦1,000,000 - ₦5,000,000" },
    { value: "5m-15m", label: "₦5,000,000 - ₦15,000,000" },
    { value: "15m-30m", label: "₦15,000,000 - ₦30,000,000" },
    { value: "30mplus", label: "₦30,000,000+" },
  ];
  const sortOptions = [
    { value: "", label: "Recommended" },
    { value: "newest", label: "Newest" },
    { value: "price_low", label: "Price: Low to High" },
    { value: "price_high", label: "Price: High to Low" },
    { value: "name", label: "Name (A-Z)" },
  ];

  const brandBlue = "#20459B";

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
        {!category && !q && (
          <section className="si-hero mx-auto grid max-w-6xl gap-10 px-6 pb-6 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.15)] bg-[rgba(45,52,97,0.06)] px-4 py-1 text-xs font-semibold text-[var(--agent-blue)]">
                <Sparkles className="h-4 w-4" />
                Agro machines & production lines
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
                Machines buyers use to scale agro processing.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
                Browse small and medium agro processing machines and complete production lines. View landed cost
                estimates for your market and start sourcing with verified China manufacturers.
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
                  Landed cost estimate (sea freight)
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
            <FilterForm
              action="/machines"
              searchPlaceholder="Search machines, lines, or processes"
              initial={{ q, category, price, sort }}
              categoryOptions={categoryOptions}
              priceOptions={priceOptions}
              sortOptions={sortOptions}
              labels={{
                category: "Category",
                price: "Budget (landed)",
                sort: "Sort by",
              }}
              clearHref="/machines"
            />
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
            Estimated landed cost using sea freight for your destination. Last‑mile delivery not included.
          </p>
        </section>
      </div>
    </main>
  );
}
