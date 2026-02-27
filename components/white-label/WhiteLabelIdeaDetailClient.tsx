"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WhiteLabelViewTracker from "@/components/white-label/WhiteLabelViewTracker";
import DeferredSection from "@/components/white-label/DeferredSection";
import { currencyForCode, formatCurrency, pickLandedFieldsByCurrency } from "@/lib/white-label-country";
import WhiteLabelAmazonReveal from "@/components/white-label/WhiteLabelAmazonReveal";
import WhiteLabelInsights from "@/components/white-label/WhiteLabelInsights";

type DetailResponse =
  | {
      ok: true;
      product: any;
      similar: any[];
      trending: any[];
      currencyCode: string;
      countryIso2: string;
      amazonComparisonEnabled: boolean;
    }
  | { ok: false; error?: string };

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cloudinaryTransform(url: string, size: number) {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) {
    return url;
  }
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${size},h_${size},c_fit/`);
}

function formatPerUnitRange(
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

function fallbackSeoDescription(product: any) {
  return (
    product.seo_description ||
    product.short_desc ||
    product.why_sells ||
    `White label ${product.product_name} idea tailored for founders and business owners in your market.`
  );
}

function fallbackSummary(product: any) {
  if (product.business_summary) return product.business_summary;
  const desc = product.short_desc || "a fast-moving white label product";
  const why = product.why_sells || "strong everyday demand";
  return `${product.product_name} is ${String(desc).toLowerCase()} built for entrepreneurs who want quick repeat sales. The market signals show ${String(why).toLowerCase()} and a clear path to brand differentiation.`;
}

function fallbackMarketNotes(product: any) {
  if (product.market_notes) return product.market_notes;
  return "Position this product for consumers who value reliability and affordability. Small minimum order quantities and strong offline demand make it a solid pick for first-time importers.";
}

function fallbackAngle(product: any) {
  if (product.white_label_angle) return product.white_label_angle;
  return "Focus on durable packaging, a clean brand story, and consistent availability. Offer bundles or starter kits to make your brand feel premium while keeping pricing accessible.";
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

export default function WhiteLabelIdeaDetailClient({ slug }: { slug: string }) {
  const [state, setState] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/white-label/ideas/detail?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: DetailResponse) => {
        if (!active) return;
        setState(json);
      })
      .catch(() => {
        if (!active) return;
        setState({ ok: false, error: "Unable to load product." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="h-5 w-40 rounded-full bg-neutral-100" />
            <div className="mt-3 h-7 w-2/3 rounded-full bg-neutral-100" />
            <div className="mt-3 h-4 w-5/6 rounded-full bg-neutral-100" />
            <div className="mt-6 h-[320px] w-full rounded-[18px] bg-neutral-100" />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={`detail-skel-${idx}`} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="h-4 w-32 rounded-full bg-neutral-100" />
                  <div className="mt-3 h-3 w-full rounded-full bg-neutral-100" />
                  <div className="mt-2 h-3 w-5/6 rounded-full bg-neutral-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="h-4 w-40 rounded-full bg-neutral-100" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`sidebar-skel-${idx}`} className="h-14 rounded-2xl bg-neutral-100" />
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="h-4 w-32 rounded-full bg-neutral-100" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`sidebar-skel-2-${idx}`} className="h-12 rounded-2xl bg-neutral-100" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !state.ok) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Product not available. Go back to{" "}
          <Link href="/white-label/ideas" className="font-semibold text-neutral-800">
            all ideas
          </Link>
          .
        </div>
      </div>
    );
  }

  const product = state.product;
  const currencyCode = state.currencyCode || "NGN";
  const currency = currencyForCode(currencyCode);
  const countryIso2 = state.countryIso2 || "";

  const landedPicked = pickLandedFieldsByCurrency(product, currencyCode);
  const summary = fallbackSummary(product);
  const marketNotes = fallbackMarketNotes(product);
  const angle = fallbackAngle(product);

  const similarItems = state.similar || [];
  const trendingItems = state.trending || [];
  const detailBase = "/white-label/ideas";

  return (
    <div className="px-6 py-10">
      <WhiteLabelViewTracker productId={product.id} source="app" />
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex justify-end" />
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-start md:justify-between">
            <div className="w-full min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                {product.category}
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{product.product_name}</h1>
              <p className="mt-3 text-sm text-neutral-600">{fallbackSeoDescription(product)}</p>
            </div>
            <div className="shrink-0">
              <div className="inline-flex whitespace-nowrap rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-700">
                {formatPerUnitRange(landedPicked.perUnitLow, landedPicked.perUnitHigh, currency) || "Pricing pending"}
              </div>
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
              <p className="mt-2 text-sm text-neutral-600">
                {formatRegulatoryNote(product.regulatory_note, countryIso2)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800">
              {landedPicked.totalLow != null || landedPicked.totalHigh != null
                ? `${formatCurrency(landedPicked.totalLow, currency)}–${formatCurrency(
                    landedPicked.totalHigh,
                    currency
                  )} for 1,000 units`
                : "Pricing pending"}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {state.amazonComparisonEnabled ? (
                <WhiteLabelAmazonReveal
                  productId={product.id}
                  currencyCode={currencyCode}
                  landedGbpLow={product.landed_gbp_sea_per_unit_low ?? null}
                  landedGbpHigh={product.landed_gbp_sea_per_unit_high ?? null}
                  landedCadLow={product.landed_cad_sea_per_unit_low ?? null}
                  landedCadHigh={product.landed_cad_sea_per_unit_high ?? null}
                />
              ) : null}
              <WhiteLabelInsights productId={product.id} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/white-label/ideas" className="text-sm font-semibold text-neutral-500 hover:text-neutral-700">
                Go back to all products
              </Link>
              <Link
                href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(
                  String(product.id)
                )}&product_name=${encodeURIComponent(product.product_name)}&product_category=${encodeURIComponent(
                  product.category
                )}&product_landed_ngn_per_unit=${encodeURIComponent(
                  formatPerUnitRange(landedPicked.perUnitLow, landedPicked.perUnitHigh, currency)
                )}`}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white"
              >
                Start sourcing
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <DeferredSection>
            <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Similar in {product.category}
              </h3>
              <div className="mt-4 space-y-4">
                {similarItems.length ? (
                  similarItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`${detailBase}/${item.slug || slugify(item.product_name)}`}
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
                          {formatPerUnitRange(
                            pickLandedFieldsByCurrency(item, currencyCode).perUnitLow,
                            pickLandedFieldsByCurrency(item, currencyCode).perUnitHigh,
                            currency
                          ) || "Pricing pending"}
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
            <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">Most viewed ideas</h3>
              <div className="mt-4 space-y-4">
                {trendingItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`${detailBase}/${item.slug || slugify(item.product_name)}`}
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
    </div>
  );
}
