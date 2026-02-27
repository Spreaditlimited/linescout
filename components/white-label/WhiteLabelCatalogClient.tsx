"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  currencyForCode,
  formatCurrency,
  pickLandedFieldsByCurrency,
} from "@/lib/white-label-country";

type ProductItem = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  slug?: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  landed_ngn_per_unit_low?: number | null;
  landed_ngn_per_unit_high?: number | null;
  landed_ngn_total_1000_low?: number | null;
  landed_ngn_total_1000_high?: number | null;
  landed_gbp_sea_per_unit_low?: number | null;
  landed_gbp_sea_per_unit_high?: number | null;
  landed_gbp_sea_total_1000_low?: number | null;
  landed_gbp_sea_total_1000_high?: number | null;
  landed_cad_sea_per_unit_low?: number | null;
  landed_cad_sea_per_unit_high?: number | null;
  landed_cad_sea_total_1000_low?: number | null;
  landed_cad_sea_total_1000_high?: number | null;
  amazon_uk_asin?: string | null;
  amazon_uk_url?: string | null;
  amazon_uk_currency?: string | null;
  amazon_uk_price_low?: number | null;
  amazon_uk_price_high?: number | null;
  amazon_ca_asin?: string | null;
  amazon_ca_url?: string | null;
  amazon_ca_currency?: string | null;
  amazon_ca_price_low?: number | null;
  amazon_ca_price_high?: number | null;
  amazon_us_asin?: string | null;
  amazon_us_url?: string | null;
  amazon_us_currency?: string | null;
  amazon_us_price_low?: number | null;
  amazon_us_price_high?: number | null;
};

function formatPerUnitRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string
) {
  const currency = currencyForCode(currencyCode);
  const perUnitDigits = currency.code === "NGN" ? 0 : 2;
  const lowText = formatCurrency(low, currency, perUnitDigits);
  const highText = formatCurrency(high, currency, perUnitDigits);
  const lowNum = low === null || low === undefined ? null : Number(low);
  const highNum = high === null || high === undefined ? null : Number(high);
  if (
    lowText !== "—" &&
    highText !== "—" &&
    Number.isFinite(lowNum) &&
    Number.isFinite(highNum) &&
    lowNum === highNum
  ) {
    return `${lowText} per unit`;
  }
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} per unit`;
  if (lowText !== "—") return `${lowText} per unit`;
  if (highText !== "—") return `${highText} per unit`;
  return "";
}

function formatTotalRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string
) {
  const currency = currencyForCode(currencyCode);
  const lowText = formatCurrency(low, currency);
  const highText = formatCurrency(high, currency);
  const lowNum = low === null || low === undefined ? null : Number(low);
  const highNum = high === null || high === undefined ? null : Number(high);
  if (
    lowText !== "—" &&
    highText !== "—" &&
    Number.isFinite(lowNum) &&
    Number.isFinite(highNum) &&
    lowNum === highNum
  ) {
    return `${lowText} for 1,000 units`;
  }
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} for 1,000 units`;
  if (lowText !== "—") return `${lowText} for 1,000 units`;
  if (highText !== "—") return `${highText} for 1,000 units`;
  return "";
}

function initials(name?: string | null) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "WL";
  const parts = cleaned.split(" ");
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (first + second).toUpperCase() || "WL";
}

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function WhiteLabelCatalogClient({
  items,
  detailBase = "/white-label",
  currencyCode = "NGN",
  amazonComparisonEnabled = true,
  lockAmazonComparison = false,
  comparisonCtaHref = "/sign-in?next=/white-label/ideas",
  comparisonCtaLabel = "Sign in to compare Amazon prices",
}: {
  items: ProductItem[];
  detailBase?: string;
  currencyCode?: string;
  amazonComparisonEnabled?: boolean;
  lockAmazonComparison?: boolean;
  comparisonCtaHref?: string;
  comparisonCtaLabel?: string;
}) {
  const normalizedBase = detailBase.endsWith("/") ? detailBase.slice(0, -1) : detailBase;
  const currency = currencyForCode(currencyCode);
  const [reveals, setReveals] = useState<
    Record<
      number,
      { loading?: boolean; error?: string | null; code?: string | null; data?: any }
    >
  >({});
  const storageKey = (productId: number) => `wl_amazon_reveal_${productId}_${currencyCode}`;
  const revealTtlMs = 24 * 60 * 60 * 1000;
  const isFresh = (payload: any) =>
    payload?.revealed_at && Date.now() - Number(payload.revealed_at) < revealTtlMs;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next: Record<number, { loading?: boolean; error?: string | null; code?: string | null; data?: any }> = {};
    items.forEach((item) => {
      try {
        const raw = window.localStorage.getItem(storageKey(item.id));
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.ok && isFresh(parsed)) {
          next[item.id] = { data: parsed, loading: false, error: null, code: null };
        } else if (parsed?.ok) {
          window.localStorage.removeItem(storageKey(item.id));
        }
      } catch {
        // Ignore invalid storage payloads.
      }
    });
    if (Object.keys(next).length) {
      setReveals((prev) => ({ ...next, ...prev }));
    }
  }, [items, currencyCode]);

  async function handleReveal(productId: number) {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey(productId));
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.ok && isFresh(cached)) {
            setReveals((prev) => ({
              ...prev,
              [productId]: { loading: false, error: null, code: null, data: cached },
            }));
            return;
          }
          if (cached?.ok) {
            window.localStorage.removeItem(storageKey(productId));
          }
        }
      } catch {
        // Ignore invalid storage payloads.
      }
    }
    setReveals((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), loading: true, error: null },
    }));
    try {
      const res = await fetch("/api/white-label/amazon/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg =
          json?.code === "subscription_required"
            ? "Subscription required to reveal Amazon prices."
            : json?.code === "limit_reached"
            ? "Daily reveal limit reached."
            : json?.error || "Failed to reveal Amazon price.";
        setReveals((prev) => ({
          ...prev,
          [productId]: { loading: false, error: msg, code: json?.code || null },
        }));
        return;
      }
      const payload = { ...json, revealed_at: Date.now() };
      setReveals((prev) => ({
        ...prev,
        [productId]: { loading: false, error: null, code: null, data: payload },
      }));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey(productId), JSON.stringify(payload));
        } catch {
          // Ignore storage errors (quota, privacy mode).
        }
      }
    } catch (e: any) {
      setReveals((prev) => ({
        ...prev,
        [productId]: {
          loading: false,
          error: e?.message || "Failed to reveal Amazon price.",
          code: null,
        },
      }));
    }
  }

  const itemLinks = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        detailHref: `${normalizedBase}/${item.slug || slugify(item.product_name)}`,
      })),
    [items, normalizedBase]
  );

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        {itemLinks.length ? (
          itemLinks.map((item) => (
            <div
              key={`${item.id}-${item.product_name}`}
              className="flex h-full flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="relative h-52 w-full border-b border-neutral-100 bg-[#F2F3F5] p-4">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={`${item.product_name} white label idea`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="h-24 w-24 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-center">
                      <div className="pt-3 text-[10px] font-semibold text-emerald-700">YOUR LOGO</div>
                      <div className="mt-1 text-[11px] font-semibold text-neutral-700">
                        {initials(item.product_name)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-5">
                <div className="flex h-full flex-col">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      {item.category}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                      {item.product_name}
                    </h2>
                    {(() => {
                      const landed = pickLandedFieldsByCurrency(item, currencyCode);
                      const hasPerUnit = landed.perUnitLow != null || landed.perUnitHigh != null;
                      const hasTotal = landed.totalLow != null || landed.totalHigh != null;
                      return (
                        <>
                          <p className="mt-3 text-sm text-neutral-600">
                            {hasPerUnit
                              ? formatPerUnitRange(landed.perUnitLow, landed.perUnitHigh, currencyCode)
                              : "Pricing pending"}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {hasTotal
                              ? formatTotalRange(landed.totalLow, landed.totalHigh, currencyCode)
                              : "Pricing pending"}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  {amazonComparisonEnabled
                    ? (() => {
                  const reveal = reveals[item.id];
                  const revealed = Boolean(reveal?.data?.ok);
                  const isCaUser = currencyCode === "CAD";
                  const isUsUser = currencyCode === "USD";
                  const dataRow = revealed ? reveal?.data?.product || {} : item;
                  const ukLow = dataRow.amazon_uk_price_low != null ? Number(dataRow.amazon_uk_price_low) : null;
                  const ukHigh = dataRow.amazon_uk_price_high != null ? Number(dataRow.amazon_uk_price_high) : null;
                  const caLow = dataRow.amazon_ca_price_low != null ? Number(dataRow.amazon_ca_price_low) : null;
                  const caHigh = dataRow.amazon_ca_price_high != null ? Number(dataRow.amazon_ca_price_high) : null;
                  const usLow = dataRow.amazon_us_price_low != null ? Number(dataRow.amazon_us_price_low) : null;
                  const usHigh = dataRow.amazon_us_price_high != null ? Number(dataRow.amazon_us_price_high) : null;
                  const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
                  const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
                  const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);

                  const useUs = isUsUser && hasUs;
                  const useCa = isCaUser && hasCa;
                  const useUk = !useUs && !useCa && hasUk;
                  const showFallbackMessage = isCaUser && !hasCa && hasUk;
                  const showUsFallbackMessage = isUsUser && !hasUs && hasUk;
                  const preferredMarket = isUsUser ? "US" : isCaUser ? "CA" : "UK";
                  const amazonCode = revealed
                    ? useUs
                      ? "USD"
                      : useCa
                      ? "CAD"
                      : "GBP"
                    : isUsUser
                    ? "USD"
                    : isCaUser
                    ? "CAD"
                    : "GBP";
                  const labelSuffix = revealed
                    ? useUs
                      ? " (US)"
                      : useCa
                      ? " (CA)"
                      : " (UK)"
                    : ` (${preferredMarket})`;
                  const amazonLow = useUs ? usLow : useCa ? caLow : ukLow;
                  const amazonHigh = useUs ? usHigh : useCa ? caHigh : ukHigh;

                  const displayAmazonRange = () => {
                    const code = amazonCode;
                    const fmt = (value: number | null) => {
                      if (value == null || !Number.isFinite(value)) return "—";
                      try {
                        return new Intl.NumberFormat(code === "GBP" ? "en-GB" : code === "USD" ? "en-US" : "en-CA", {
                          style: "currency",
                          currency: code,
                          maximumFractionDigits: 2,
                        }).format(value);
                      } catch {
                        const symbol = code === "GBP" ? "£" : code === "USD" ? "$" : "CA$";
                        return `${symbol}${value.toFixed(2)}`;
                      }
                    };
                    const lowText = fmt(Number.isFinite(amazonLow) ? amazonLow : null);
                    const highText = fmt(Number.isFinite(amazonHigh) ? amazonHigh : null);
                    if (lowText !== "—" && highText !== "—" && amazonLow === amazonHigh) {
                      return lowText;
                    }
                    if (lowText !== "—" && highText !== "—") return `${lowText}–${highText}`;
                    if (lowText !== "—") return lowText;
                    if (highText !== "—") return highText;
                    return "—";
                  };

                  const landedForAmazon = () => {
                    if (amazonCode === "GBP") {
                      return {
                        low: item.landed_gbp_sea_per_unit_low ?? null,
                        high: item.landed_gbp_sea_per_unit_high ?? null,
                      };
                    }
                    if (amazonCode === "CAD") {
                      return {
                        low: item.landed_cad_sea_per_unit_low ?? null,
                        high: item.landed_cad_sea_per_unit_high ?? null,
                      };
                    }
                    return { low: null, high: null };
                  };

                  const marginRange = () => {
                    const landed = landedForAmazon();
                    const low = Number.isFinite(amazonLow) ? amazonLow : null;
                    const high = Number.isFinite(amazonHigh) ? amazonHigh : null;
                    if (low == null || high == null || landed.low == null || landed.high == null) return null;
                    const lowMargin = (low - landed.high) / low;
                    const highMargin = (high - landed.low) / high;
                    if (!Number.isFinite(lowMargin) || !Number.isFinite(highMargin)) return null;
                    const clamp = (v: number) => Math.max(-0.99, Math.min(v, 0.99));
                    const toPct = (v: number) => `${Math.round(clamp(v) * 100)}%`;
                    return `${toPct(lowMargin)}–${toPct(highMargin)}`;
                  };

                  const rangeText = displayAmazonRange();
                  const marginText = marginRange();

                  return (
                    <div className="mt-auto pt-4">
                      <div className="min-h-[96px] rounded-2xl border border-[rgba(45,52,97,0.22)] bg-gradient-to-br from-white via-white to-[rgba(45,52,97,0.10)] px-3 py-2 text-xs text-neutral-600 shadow-[0_14px_30px_rgba(45,52,97,0.16)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                        Amazon price{labelSuffix}
                      </p>
                      {lockAmazonComparison ? (
                        <div className="mt-1 flex min-h-[70px] flex-col">
                          <p className="text-[11px] text-neutral-500">Amazon price available</p>
                          <div className="mt-2">
                            <span className="inline-flex rounded-full bg-[rgba(45,52,97,0.2)] px-4 py-1 text-[11px] font-semibold text-[rgba(45,52,97,0.55)] blur-sm">
                              £129.99–£199.99
                            </span>
                          </div>
                          <Link
                            href={comparisonCtaHref}
                            className="mt-auto inline-flex text-[11px] font-semibold text-[var(--agent-blue)]"
                          >
                            {comparisonCtaLabel}
                          </Link>
                        </div>
                      ) : revealed ? (
                        <>
                          <p className="mt-1 text-sm font-semibold text-neutral-800">{rangeText}</p>
                          {marginText ? (
                            <p className="mt-1 text-[11px] text-neutral-500">
                              Indicative margin: {marginText}
                            </p>
                          ) : null}
                          {showUsFallbackMessage ? (
                            <p className="mt-1 text-[11px] text-amber-700">
                              Amazon US price not available at this time for this product.
                            </p>
                          ) : null}
                          {showFallbackMessage ? (
                            <p className="mt-1 text-[11px] text-amber-700">
                              Amazon CA price not available at this time for this product.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-[11px] text-neutral-500">Amazon price available</p>
                          <div className="mt-2">
                            <span className="inline-flex rounded-full bg-[rgba(45,52,97,0.2)] px-4 py-1 text-[11px] font-semibold text-[rgba(45,52,97,0.55)] blur-sm">
                              £129.99–£199.99
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleReveal(item.id)}
                            disabled={reveal?.loading}
                            className="mt-2 inline-flex text-[11px] font-semibold text-[var(--agent-blue)] disabled:opacity-60"
                          >
                            {reveal?.loading ? "Revealing..." : "Reveal Amazon price"}
                          </button>
                          {reveal?.error ? (
                            <div className="mt-1 text-[11px] text-amber-700">
                              {reveal.error}
                              {reveal?.code === "subscription_required" ? (
                                <Link
                                  href="/white-label/subscribe"
                                  className="ml-2 inline-flex font-semibold text-[var(--agent-blue)]"
                                >
                                  Subscribe now
                                </Link>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    </div>
                  );
                })()
                    : null}
                </div>
              </div>

              <div className="mt-auto px-5 pb-6">
                <Link
                  href={item.detailHref}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700"
                >
                  View detail
                </Link>
                {(() => {
                  const landed = pickLandedFieldsByCurrency(item, currencyCode);
                  const perUnitText = formatPerUnitRange(landed.perUnitLow, landed.perUnitHigh, currencyCode);
                  return (
                    <Link
                      href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(item.id))}&product_name=${encodeURIComponent(item.product_name)}&product_category=${encodeURIComponent(item.category)}&product_landed_ngn_per_unit=${encodeURIComponent(perUnitText)}`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Start sourcing
                    </Link>
                  );
                })()}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            No ideas matched your search. Try a different keyword or category.
          </div>
        )}
      </div>
    </>
  );
}
