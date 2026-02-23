"use client";

import { useState } from "react";

type RevealResult = {
  ok: true;
  product: {
    amazon_uk_price_low?: number | null;
    amazon_uk_price_high?: number | null;
    amazon_ca_price_low?: number | null;
    amazon_ca_price_high?: number | null;
  };
  display?: {
    marketplace?: "UK" | "CA" | null;
    currency?: "GBP" | "CAD" | null;
    price_low?: number | null;
    price_high?: number | null;
    note?: string | null;
  };
};

export default function WhiteLabelAmazonReveal({
  productId,
  currencyCode,
  landedGbpLow,
  landedGbpHigh,
  landedCadLow,
  landedCadHigh,
}: {
  productId: number;
  currencyCode: string;
  landedGbpLow: number | null;
  landedGbpHigh: number | null;
  landedCadLow: number | null;
  landedCadHigh: number | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevealResult | null>(null);

  const revealed = Boolean(data?.ok);
  const isCaUser = currencyCode === "CAD";

  const ukLow = data?.product?.amazon_uk_price_low ?? null;
  const ukHigh = data?.product?.amazon_uk_price_high ?? null;
  const caLow = data?.product?.amazon_ca_price_low ?? null;
  const caHigh = data?.product?.amazon_ca_price_high ?? null;
  const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
  const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
  const useCa = isCaUser && hasCa;
  const useUk = !useCa && hasUk;
  const amazonCode = revealed ? (useCa ? "CAD" : "GBP") : isCaUser ? "CAD" : "GBP";
  const labelSuffix = revealed ? (useCa ? " (CA)" : " (UK)") : isCaUser ? " (CA)" : " (UK)";
  const amazonLow = useCa ? caLow : ukLow;
  const amazonHigh = useCa ? caHigh : ukHigh;

  const fmt = (value: number | null, code: string) => {
    if (value == null || !Number.isFinite(value)) return "—";
    try {
      return new Intl.NumberFormat(code === "GBP" ? "en-GB" : "en-CA", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      const symbol = code === "GBP" ? "£" : "CA$";
      return `${symbol}${value.toFixed(2)}`;
    }
  };

  const rangeText = () => {
    const lowText = fmt(Number.isFinite(amazonLow) ? amazonLow : null, amazonCode);
    const highText = fmt(Number.isFinite(amazonHigh) ? amazonHigh : null, amazonCode);
    if (lowText !== "—" && highText !== "—" && amazonLow === amazonHigh) return lowText;
    if (lowText !== "—" && highText !== "—") return `${lowText}–${highText}`;
    if (lowText !== "—") return lowText;
    if (highText !== "—") return highText;
    return "—";
  };

  const marginRange = () => {
    const landedLow = amazonCode === "GBP" ? landedGbpLow : landedCadLow;
    const landedHigh = amazonCode === "GBP" ? landedGbpHigh : landedCadHigh;
    const low = Number.isFinite(amazonLow) ? amazonLow : null;
    const high = Number.isFinite(amazonHigh) ? amazonHigh : null;
    if (low == null || high == null || landedLow == null || landedHigh == null) return null;
    const lowMargin = (low - landedHigh) / low;
    const highMargin = (high - landedLow) / high;
    if (!Number.isFinite(lowMargin) || !Number.isFinite(highMargin)) return null;
    const clamp = (v: number) => Math.max(-0.99, Math.min(v, 0.99));
    const toPct = (v: number) => `${Math.round(clamp(v) * 100)}%`;
    return `${toPct(lowMargin)}–${toPct(highMargin)}`;
  };

  async function reveal() {
    setLoading(true);
    setError(null);
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
        setError(msg);
        return;
      }
      setData(json as RevealResult);
    } catch (e: any) {
      setError(e?.message || "Failed to reveal Amazon price.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
        Amazon price{labelSuffix}
      </p>
      {revealed ? (
        <>
          <p className="mt-1 text-sm font-semibold text-neutral-800">{rangeText()}</p>
          {marginRange() ? (
            <p className="mt-1 text-[11px] text-neutral-500">Indicative margin: {marginRange()}</p>
          ) : null}
          {isCaUser && !hasCa && hasUk ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Amazon CA price not available at this time for this product.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-neutral-500">Amazon price available</p>
          <button
            type="button"
            onClick={reveal}
            disabled={loading}
            className="mt-2 inline-flex text-[11px] font-semibold text-[var(--agent-blue)] disabled:opacity-60"
          >
            {loading ? "Revealing..." : "Reveal Amazon price"}
          </button>
          {error ? <p className="mt-1 text-[11px] text-amber-700">{error}</p> : null}
        </>
      )}
    </div>
  );
}
