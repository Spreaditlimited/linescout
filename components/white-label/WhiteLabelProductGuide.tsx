import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Eye,
  PackageCheck,
  ShieldAlert,
  Sparkles,
  Target,
  Truck,
  Users,
} from "lucide-react";

import DeferredSection from "@/components/white-label/DeferredSection";
import WhiteLabelViewTracker from "@/components/white-label/WhiteLabelViewTracker";
import type { WhiteLabelSeoContent } from "@/lib/white-label-seo-types";
import { currencyForCode, formatCurrency } from "@/lib/white-label-country";

type GuideProduct = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  image_url: string | null;
  slug: string | null;
  regulatory_note: string | null;
  landed_per_unit_low?: number | null;
  landed_per_unit_high?: number | null;
  landed_total_1000_low?: number | null;
  landed_total_1000_high?: number | null;
  view_count?: number | null;
};

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatPerUnitRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string,
) {
  const currency = currencyForCode(currencyCode);
  const digits = currency.code === "NGN" ? 0 : 2;
  const lowText = formatCurrency(low, currency, digits);
  const highText = formatCurrency(high, currency, digits);
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText}`;
  if (lowText !== "—") return lowText;
  if (highText !== "—") return highText;
  return "Pricing pending";
}

function ProductLinkCard({ product }: { product: GuideProduct }) {
  return (
    <Link
      href={`/white-label/${product.slug || slugify(product.product_name)}`}
      className="group min-w-0 overflow-hidden rounded-3xl border border-neutral-200 bg-white"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F2F3F5]">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.product_name}
            fill
            sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
            className="object-contain p-5 transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-bold text-neutral-400">YOUR LOGO</div>
        )}
      </div>
      <div className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">{product.category}</p>
        <h3 className="mt-2 line-clamp-2 text-base font-bold text-neutral-900">{product.product_name}</h3>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-orange-600">
          View product <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export default function WhiteLabelProductGuide({
  product,
  seoContent,
  summary,
  marketNotes,
  angle,
  regulatoryNote,
  currencyCode,
  sourcingHref,
  amazonComparisonEnabled,
  amazonPriceRange,
  similarItems,
  popularItems,
}: {
  product: GuideProduct;
  seoContent: WhiteLabelSeoContent | null;
  summary: string;
  marketNotes: string;
  angle: string;
  regulatoryNote: string;
  currencyCode: string;
  sourcingHref: string;
  amazonComparisonEnabled: boolean;
  amazonPriceRange: string | null;
  similarItems: GuideProduct[];
  popularItems: GuideProduct[];
}) {
  const currency = currencyForCode(currencyCode);
  const perUnitText = formatPerUnitRange(
    product.landed_per_unit_low,
    product.landed_per_unit_high,
    currencyCode,
  );
  const totalText =
    product.landed_total_1000_low != null || product.landed_total_1000_high != null
      ? `${formatCurrency(product.landed_total_1000_low, currency)}–${formatCurrency(
          product.landed_total_1000_high,
          currency,
        )}`
      : "Pricing pending";
  const intro = seoContent?.introduction || summary;
  const visiblePopular = popularItems.filter((item) => item.id !== product.id).slice(0, 4);

  return (
    <main className="min-h-screen bg-[#F5F6FA] text-neutral-900">
      <WhiteLabelViewTracker productId={product.id} source="marketing" />

      <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
        <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-orange-100/60 blur-3xl dark:bg-orange-950/20" />
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-500">
            <Link href="/white-label" className="inline-flex items-center gap-1 hover:text-orange-600">
              <ArrowLeft className="h-3.5 w-3.5" /> White-label products
            </Link>
            <span aria-hidden="true">/</span>
            <span>{product.category}</span>
          </nav>

          <div className="mt-8 grid min-w-0 items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
            <div className="relative min-w-0">
              <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-neutral-200 bg-[#F2F3F5] shadow-[0_28px_80px_-48px_rgba(15,23,42,0.5)]">
                {product.image_url ? (
                  <Image
                    src={product.image_url}
                    alt={`${product.product_name} private-label product concept`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 44vw, 92vw"
                    className="object-contain p-7 sm:p-10"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-bold text-neutral-400">YOUR LOGO</div>
                )}
              </div>
              <div className="absolute -bottom-5 left-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-xl sm:left-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Concept</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <Sparkles className="h-4 w-4 text-orange-500" /> Ready for your brand
                </p>
              </div>
            </div>

            <div className="min-w-0 pt-4 lg:pt-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">{product.category}</p>
              <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-[-0.045em] text-neutral-950 sm:text-5xl lg:text-6xl">
                {product.product_name}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-neutral-600 sm:text-lg">
                {seoContent?.seoDescription || product.short_desc || summary}
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="border-l-2 border-orange-500 pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Landed estimate</p>
                  <p className="mt-1 text-sm font-bold text-neutral-900">{perUnitText} / unit</p>
                </div>
                <div className="border-l-2 border-orange-500 pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">1,000 units</p>
                  <p className="mt-1 text-sm font-bold text-neutral-900">{totalText}</p>
                </div>
                <div className="border-l-2 border-orange-500 pl-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Interest</p>
                  <p className="mt-1 text-sm font-bold text-neutral-900">{Number(product.view_count || 0).toLocaleString()} views</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={sourcingHref}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600"
                >
                  Start sourcing <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#product-guide"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-bold text-neutral-900"
                >
                  Evaluate this product
                </a>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                <BadgeCheck className="h-4 w-4 text-emerald-600" /> Sourcing execution by Sure Imports specialists
              </p>
            </div>
          </div>
        </div>
      </section>

      <nav
        aria-label="Product guide chapters"
        className="sticky top-[86px] z-30 border-b border-neutral-200 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
          {[
            ["#product-guide", "Opportunity"],
            ["#market-fit", "Market fit"],
            ...(seoContent
              ? [
                  ["#specification-brief", "Specifications"],
                  ["#supplier-checks", "Supplier checks"],
                  ["#risk-planning", "Risks & shipping"],
                  ["#product-faq", "FAQs"],
                ]
              : []),
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold text-neutral-600 transition hover:bg-orange-50 hover:text-orange-700"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto grid w-full max-w-7xl items-start gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8 lg:py-24">
        <article className="min-w-0 rounded-[2rem] border border-neutral-200 bg-white px-5 py-8 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.55)] sm:px-8 lg:px-12 lg:py-12">
          <section id="product-guide" className="scroll-mt-40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Product opportunity</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
              Is {product.product_name.toLowerCase()} a good private-label product?
            </h2>
            <p className="mt-6 text-lg leading-8 text-neutral-700">{intro}</p>
            <div className="mt-9 border-l-4 border-orange-500 bg-orange-50 px-5 py-5 dark:bg-orange-950/20">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400">The commercial case</p>
              <p className="mt-2 text-base leading-7 text-neutral-700">{summary}</p>
            </div>
          </section>

          <section id="market-fit" className="mt-14 scroll-mt-40 border-t border-neutral-200 pt-12">
            <div className="flex items-start gap-4">
              <Target className="mt-1 h-6 w-6 shrink-0 text-orange-600" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Market fit</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                  Demand, buyers, and the brand angle
                </h2>
              </div>
            </div>
            <p className="mt-6 text-base leading-8 text-neutral-600">{marketNotes}</p>

            {seoContent ? (
              <div className="mt-9 grid gap-10 md:grid-cols-2">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-neutral-900">
                    <Sparkles className="h-5 w-5 text-orange-600" /> What drives demand
                  </h3>
                  <ul className="mt-5 space-y-4">
                    {seoContent.demandDrivers.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-neutral-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-neutral-900">
                    <Users className="h-5 w-5 text-orange-600" /> Likely customer groups
                  </h3>
                  <ul className="mt-5 divide-y divide-neutral-200 border-y border-neutral-200">
                    {seoContent.targetBuyers.map((item) => (
                      <li key={item} className="py-3 text-sm leading-6 text-neutral-600">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="mt-10 rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">Recommended white-label angle</p>
              <p className="mt-3 text-base leading-7 text-slate-200">{angle}</p>
            </div>
          </section>

          {seoContent ? (
            <>
              <section id="specification-brief" className="mt-14 scroll-mt-40 border-t border-neutral-200 pt-12">
                <div className="flex items-start gap-4">
                  <ClipboardCheck className="mt-1 h-6 w-6 shrink-0 text-orange-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Build the brief</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                      Specifications to settle before requesting quotes
                    </h2>
                  </div>
                </div>
                <p className="mt-5 max-w-3xl text-base leading-7 text-neutral-600">
                  Send every shortlisted supplier the same written brief. That makes quotations comparable and reduces substitutions after sample approval.
                </p>
                <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
                  {seoContent.specifications.map((item, index) => (
                    <div key={item.label} className="grid gap-2 py-5 sm:grid-cols-[3rem_12rem_1fr] sm:gap-4">
                      <span className="text-xs font-black text-orange-600">{String(index + 1).padStart(2, "0")}</span>
                      <dt className="text-sm font-bold text-neutral-900">{item.label}</dt>
                      <dd className="text-sm leading-6 text-neutral-600">{item.guidance}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-12 grid gap-10 md:grid-cols-2">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Customization ideas</h3>
                    <ul className="mt-5 space-y-3">
                      {seoContent.customizationIdeas.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-neutral-600">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Possible market positions</h3>
                    <ol className="mt-5 space-y-3">
                      {seoContent.positioningIdeas.map((item, index) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-neutral-600">
                          <span className="font-black text-orange-600">{index + 1}.</span> {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </section>

              <section id="supplier-checks" className="mt-14 scroll-mt-40 border-t border-neutral-200 pt-12">
                <div className="flex items-start gap-4">
                  <PackageCheck className="mt-1 h-6 w-6 shrink-0 text-orange-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Supplier due diligence</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                      Ask better questions. Inspect the answers.
                    </h2>
                  </div>
                </div>
                <div className="mt-9 grid gap-10 lg:grid-cols-2">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Questions for potential suppliers</h3>
                    <ol className="mt-5 space-y-5">
                      {seoContent.supplierQuestions.map((item, index) => (
                        <li key={item} className="grid grid-cols-[2rem_1fr] gap-3 text-sm leading-6 text-neutral-600">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-xs font-black text-orange-700">
                            {index + 1}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Quality-control checklist</h3>
                    <ul className="mt-5 space-y-5">
                      {seoContent.qualityChecks.map((item) => (
                        <li key={item} className="grid grid-cols-[2rem_1fr] gap-3 text-sm leading-6 text-neutral-600">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <Check className="h-4 w-4" />
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section id="risk-planning" className="mt-14 scroll-mt-40 border-t border-neutral-200 pt-12">
                <div className="flex items-start gap-4">
                  <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Protect the order</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                      Risks to resolve before production
                    </h2>
                  </div>
                </div>
                <div className="mt-8 overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                  {seoContent.sourcingRisks.map((risk, index) => (
                    <div key={risk.title} className={`p-5 sm:p-6 ${index ? "border-t border-amber-200 dark:border-amber-800" : ""}`}>
                      <h3 className="text-sm font-bold text-neutral-900">{risk.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-neutral-600">{risk.guidance}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 grid gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:grid-cols-[auto_1fr] sm:p-8">
                  <Truck className="h-7 w-7 text-orange-400" />
                  <div>
                    <h3 className="text-lg font-bold">Shipping and landed-cost planning</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{seoContent.shippingNotes}</p>
                  </div>
                </div>
              </section>

              <section id="product-faq" className="mt-14 scroll-mt-40 border-t border-neutral-200 pt-12">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Product sourcing FAQ</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                  Questions founders ask before sourcing
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">Open any question to read the answer.</p>
                <div className="mt-7 space-y-3">
                  {seoContent.faqs.map((faq) => (
                    <details key={faq.question} className="group overflow-hidden border-b border-neutral-200">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-bold text-neutral-900 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span>{faq.question}</span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600 transition group-open:rotate-180">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </summary>
                      <p className="max-w-3xl pb-6 text-sm leading-7 text-neutral-600">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </article>

        <aside className="space-y-5 lg:sticky lg:top-40">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.55)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Sourcing snapshot</p>
            <dl className="mt-5 divide-y divide-neutral-200">
              <div className="pb-4">
                <dt className="text-xs text-neutral-500">Estimated landed cost</dt>
                <dd className="mt-1 text-lg font-black text-neutral-900">{perUnitText} / unit</dd>
              </div>
              <div className="py-4">
                <dt className="text-xs text-neutral-500">Estimated total for 1,000</dt>
                <dd className="mt-1 text-base font-bold text-neutral-900">{totalText}</dd>
              </div>
              <div className="py-4">
                <dt className="text-xs text-neutral-500">Regulatory note</dt>
                <dd className="mt-1 text-sm leading-6 text-neutral-700">{regulatoryNote}</dd>
              </div>
              {amazonComparisonEnabled ? (
                <div className="pt-4">
                  <dt className="text-xs text-neutral-500">Amazon market signal</dt>
                  <dd className="mt-1 text-sm font-bold text-neutral-900">{amazonPriceRange || "Available after sign-in"}</dd>
                  {!amazonPriceRange ? (
                    <Link href="/sign-in?next=/white-label/ideas" className="mt-2 inline-flex text-xs font-bold text-orange-600">
                      Sign in to compare prices
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </dl>
            <Link
              href={sourcingHref}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600"
            >
              Start sourcing <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-[11px] leading-5 text-neutral-500">Share your target market, quantity, quality level, and branding requirements.</p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <CircleDollarSign className="h-5 w-5 text-orange-600" /> Estimate, not a final quote
            </p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Final pricing depends on specifications, quantity, packaging, destination, exchange rate, and shipping method.
            </p>
          </div>
        </aside>
      </div>

      <section className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Move from research to execution</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Ready to source {product.product_name.toLowerCase()}?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Turn this guide into a supplier-ready brief with help from the Sure Imports sourcing team.</p>
          </div>
          <Link href={sourcingHref} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600">
            Start sourcing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <DeferredSection>
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Keep exploring</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-900">Similar products</h2>
            </div>
            <Link href="/white-label" className="inline-flex items-center gap-2 text-sm font-bold text-orange-600">
              View all products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similarItems.slice(0, 4).map((item) => <ProductLinkCard key={item.id} product={item} />)}
          </div>

          {visiblePopular.length ? (
            <div className="mt-16 border-t border-neutral-200 pt-12">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-orange-600" />
                <h2 className="text-xl font-black text-neutral-900">Most popular white-label products</h2>
              </div>
              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {visiblePopular.map((item) => <ProductLinkCard key={item.id} product={item} />)}
              </div>
            </div>
          ) : null}
        </section>
      </DeferredSection>
    </main>
  );
}
