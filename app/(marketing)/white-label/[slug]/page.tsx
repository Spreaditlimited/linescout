import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { computeLandedRange, ensureWhiteLabelProductsReady } from "@/lib/white-label-products";
import MarketingTopNav from "@/components/MarketingTopNav";
import WhiteLabelViewTracker from "@/components/white-label/WhiteLabelViewTracker";
import DeferredSection from "@/components/white-label/DeferredSection";

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
  view_count?: number | null;
};

function formatNaira(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `₦${Math.round(value).toLocaleString()}`;
}

function formatPerUnitRange(low?: number | null, high?: number | null) {
  const lowText = formatNaira(low);
  const highText = formatNaira(high);
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} per unit`;
  if (lowText !== "—") return `${lowText} per unit`;
  if (highText !== "—") return `${highText} per unit`;
  return "";
}

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function fallbackSeoDescription(product: ProductRow) {
  return (
    product.seo_description ||
    product.short_desc ||
    product.why_sells ||
    `White label ${product.product_name} idea tailored for Nigerian founders and business owners.`
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
  return "Position this product for Nigerian consumers who value reliability and affordability. Small minimum order quantities and strong offline demand make it a solid pick for first-time importers.";
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

  const conn = await db.getConnection();
  let product: ProductRow | null = null;
  let similar: ProductRow[] = [];
  let mostViewed: ProductRow[] = [];
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
    product = rows?.[0] || null;

    if (!product) {
      notFound();
    }

    const [similarRows]: any = await conn.query(
      `
      SELECT p.*, COALESCE(v.views, 0) AS view_count
      FROM linescout_white_label_products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS views
        FROM linescout_white_label_views
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE p.category = ? AND p.id <> ? AND p.is_active = 1
      ORDER BY view_count DESC, p.sort_order ASC, p.id DESC
      LIMIT 6
      `,
      [product.category, product.id]
    );
    similar = similarRows || [];

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
      LIMIT 6
      `
    );
    mostViewed = viewRows || [];
  } finally {
    conn.release();
  }

  if (!product) return null;

  const landed = computeLandedRange({
    fob_low_usd: product.fob_low_usd,
    fob_high_usd: product.fob_high_usd,
    cbm_per_1000: product.cbm_per_1000,
  });

  const summary = fallbackSummary(product);
  const marketNotes = fallbackMarketNotes(product);
  const angle = fallbackAngle(product);

  const similarItems = similar.map((item) => ({
    ...item,
    ...computeLandedRange({
      fob_low_usd: item.fob_low_usd,
      fob_high_usd: item.fob_high_usd,
      cbm_per_1000: item.cbm_per_1000,
    }),
  }));

  const trendingItems = mostViewed.map((item) => ({
    ...item,
    ...computeLandedRange({
      fob_low_usd: item.fob_low_usd,
      fob_high_usd: item.fob_high_usd,
      cbm_per_1000: item.cbm_per_1000,
    }),
  }));

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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">{product.category}</p>
                <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{product.product_name}</h1>
                <p className="mt-3 text-sm text-neutral-600">{fallbackSeoDescription(product)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-700">
                {formatPerUnitRange(landed.landed_ngn_per_unit_low, landed.landed_ngn_per_unit_high) || "Pricing pending"}
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
                <p className="mt-2 text-sm text-neutral-600">{product.regulatory_note || "Not specified."}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800">
                {formatNaira(landed.landed_ngn_total_1000_low)}–{formatNaira(landed.landed_ngn_total_1000_high)} for 1,000 units
              </div>
              <Link
                href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(product.id))}&product_name=${encodeURIComponent(product.product_name)}&product_category=${encodeURIComponent(product.category)}&product_landed_ngn_per_unit=${encodeURIComponent(formatPerUnitRange(landed.landed_ngn_per_unit_low, landed.landed_ngn_per_unit_high))}`}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#2D3461] px-6 py-3 text-sm font-semibold text-white"
              >
                Start sourcing
              </Link>
              <Link href="/white-label" className="text-sm font-semibold text-neutral-500 hover:text-neutral-700">
                Back to ideas
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
                          {formatPerUnitRange(item.landed_ngn_per_unit_low, item.landed_ngn_per_unit_high) || "Pricing pending"}
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
