"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RevealResult = {
  ok: true;
  product: {
    amazon_uk_price_low?: number | null;
    amazon_uk_price_high?: number | null;
    amazon_ca_price_low?: number | null;
    amazon_ca_price_high?: number | null;
    amazon_us_price_low?: number | null;
    amazon_us_price_high?: number | null;
  };
  display?: {
    marketplace?: "UK" | "CA" | "US" | null;
    currency?: "GBP" | "CAD" | "USD" | null;
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [data, setData] = useState<RevealResult | null>(null);
  const storageKey = `wl_amazon_reveal_${productId}_${currencyCode}`;
  const revealTtlMs = 24 * 60 * 60 * 1000;
  const isFresh = (payload: any) =>
    payload?.revealed_at && Date.now() - Number(payload.revealed_at) < revealTtlMs;
  const toNum = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.ok && isFresh(parsed)) {
        setData(parsed as RevealResult);
      } else if (parsed?.ok) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore invalid storage payloads.
    }
  }, [storageKey]);

  const revealed = Boolean(data?.ok);
  const isCaUser = currencyCode === "CAD";
  const isUsUser = currencyCode === "USD";

  const ukLow = toNum(data?.product?.amazon_uk_price_low);
  const ukHigh = toNum(data?.product?.amazon_uk_price_high);
  const caLow = toNum(data?.product?.amazon_ca_price_low);
  const caHigh = toNum(data?.product?.amazon_ca_price_high);
  const usLow = toNum(data?.product?.amazon_us_price_low);
  const usHigh = toNum(data?.product?.amazon_us_price_high);
  const hasUk = Number.isFinite(ukLow) || Number.isFinite(ukHigh);
  const hasCa = Number.isFinite(caLow) || Number.isFinite(caHigh);
  const hasUs = Number.isFinite(usLow) || Number.isFinite(usHigh);
  const useUs = isUsUser && hasUs;
  const useCa = isCaUser && hasCa;
  const useUk = !useUs && !useCa && hasUk;
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
    : isUsUser
    ? " (US)"
    : isCaUser
    ? " (CA)"
    : " (UK)";
  const amazonLow = useUs ? usLow : useCa ? caLow : ukLow;
  const amazonHigh = useUs ? usHigh : useCa ? caHigh : ukHigh;

  const fmt = (value: number | null, code: string) => {
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
    const landedLow = amazonCode === "GBP" ? landedGbpLow : amazonCode === "CAD" ? landedCadLow : null;
    const landedHigh = amazonCode === "GBP" ? landedGbpHigh : amazonCode === "CAD" ? landedCadHigh : null;
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

  const insightLine = () => {
    const landedLow = amazonCode === "GBP" ? landedGbpLow : amazonCode === "CAD" ? landedCadLow : null;
    const landedHigh = amazonCode === "GBP" ? landedGbpHigh : amazonCode === "CAD" ? landedCadHigh : null;
    if (landedLow == null || landedHigh == null || !Number.isFinite(landedLow) || !Number.isFinite(landedHigh)) {
      return null;
    }
    return `Compare to your estimated landed cost (${fmt(landedLow, amazonCode)}–${fmt(landedHigh, amazonCode)}).`;
  };

  async function reveal() {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.ok && isFresh(cached)) {
            setData(cached as RevealResult);
            return;
          }
          if (cached?.ok) {
            window.localStorage.removeItem(storageKey);
          }
        }
      } catch {
        // Ignore invalid storage payloads.
      }
    }
    setLoading(true);
    setError(null);
    setErrorCode(null);
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
        setErrorCode(json?.code || null);
        return;
      }
      const payload = { ...json, revealed_at: Date.now() };
      setData(payload as RevealResult);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
          // Ignore storage errors (quota, privacy mode).
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to reveal Amazon price.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-[rgba(45,52,97,0.2)] bg-gradient-to-br from-white via-white to-[rgba(45,52,97,0.08)] p-6 text-xs text-neutral-600 shadow-[0_18px_44px_rgba(45,52,97,0.15)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
        Amazon price{labelSuffix}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-neutral-900">Amazon Retail Price</h3>
      <p className="mt-1 text-xs text-neutral-500">See the current market price of this product on Amazon now.</p>
      {revealed ? (
        <>
          <p className="mt-3 text-sm font-semibold text-neutral-800">{rangeText()}</p>
          {marginRange() ? (
            <p className="mt-1 text-[11px] text-neutral-500">Indicative margin: {marginRange()}</p>
          ) : null}
          {insightLine() ? (
            <p className="mt-1 text-[11px] text-neutral-500">{insightLine()}</p>
          ) : null}
          {isUsUser && !hasUs && hasUk ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Amazon US price not available at this time for this product.
            </p>
          ) : null}
          {isCaUser && !hasCa && hasUk ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Amazon CA price not available at this time for this product.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {insightLine() ? (
            <p className="mt-1 text-[11px] text-neutral-500">{insightLine()}</p>
          ) : null}
          <div className="mt-3">
            <span className="inline-flex rounded-full bg-[rgba(45,52,97,0.2)] px-4 py-1 text-[11px] font-semibold text-[rgba(45,52,97,0.55)] blur-sm">
              £129.99–£199.99
            </span>
          </div>
        </>
      )}
      <div className="mt-5 rounded-2xl border border-[rgba(45,52,97,0.16)] bg-white/80 px-3 py-2 text-[11px] text-neutral-600 shadow-[0_10px_22px_rgba(45,52,97,0.08)]">
        <p className="font-semibold text-neutral-700">What this means</p>
        <p className="mt-1">Use this range to sense retail demand and estimate your margin.</p>
        {!revealed ? (
          <button
            type="button"
            onClick={reveal}
            disabled={loading}
            className="btn btn-primary mt-3 px-4 py-2 text-xs disabled:opacity-60"
          >
            {loading ? "Revealing..." : "Reveal Price"}
          </button>
        ) : null}
      </div>
      {!revealed && error ? (
        <div className="mt-1 text-[11px] text-amber-700">
          {error}
          {errorCode === "subscription_required" ? (
            <Link
              href="/white-label/subscribe"
              className="ml-2 inline-flex font-semibold text-[var(--agent-blue)]"
            >
              Subscribe now
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
