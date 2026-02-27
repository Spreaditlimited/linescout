"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ShieldCheck, TrendingUp, Users } from "lucide-react";

type InsightsResponse =
  | {
      ok: true;
      product: {
        id: number;
        name: string;
        category: string;
        short_desc: string | null;
        image_url: string | null;
      };
      market: "UK" | "CA" | "US";
      currency: "GBP" | "CAD" | "USD";
      note?: string | null;
      metrics: {
        trend_30: number | null;
        trend_90: number | null;
        offer_count: number | null;
        seasonality: number | null;
        buy_box_stability: string | null;
      };
      raw: {
        price_current: number | null;
        price_avg30: number | null;
        price_avg90: number | null;
        price_min: number | null;
        price_max: number | null;
        price_low: number | null;
        price_high: number | null;
        offer_count: number | null;
        last_checked_at: string | null;
        landed_per_unit_low: number | null;
        landed_per_unit_high: number | null;
      };
    }
  | { ok: false; code?: string; error?: string };

export default function WhiteLabelInsightsInfoPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [allowLocal, setAllowLocal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updateStalled, setUpdateStalled] = useState(false);
  const refreshRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        setAllowLocal(true);
      }
      const params = new URLSearchParams(window.location.search);
      const pid = Number(params.get("product_id") || 0);
      if (pid) setProductId(pid);
    }
  }, []);

  useEffect(() => {
    if (!productId) return;
    refreshRequestedRef.current = false;
    setUpdateStalled(false);
    let live = true;
    setLoading(true);
    fetch(`/api/white-label/insights?product_id=${encodeURIComponent(String(productId))}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json: InsightsResponse) => {
        if (!live) return;
        setData(json);
      })
      .catch((e: any) => {
        if (!live) return;
        setErr(e?.message || "Unable to load insights.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [productId]);

  const trendSentence = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "Updating";
    const abs = Math.abs(value);
    if (value > 0) return `Up ${abs}% vs average`;
    if (value < 0) return `Down ${abs}% vs average`;
    return "Flat vs average";
  };

  const volatilityLabel = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "Updating";
    if (value >= 20) return `High swings (${value}%)`;
    if (value >= 8) return `Medium swings (${value}%)`;
    return `Low swings (${value}%)`;
  };

  const showBlocked = !allowLocal && data && !data.ok && (data as any).code;
  const blockedCode = showBlocked ? (data as any).code : null;

  const hasUpdating =
    !!(data && data.ok) &&
    (data.metrics.trend_30 == null ||
      data.metrics.trend_90 == null ||
      data.metrics.offer_count == null ||
      data.metrics.seasonality == null ||
      data.metrics.buy_box_stability == null);
  const updatingLabel = updateStalled ? "Not enough data yet" : "Updating";
  const raw = data && data.ok ? data.raw : null;

  const fmtMoney = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    const currency = data && data.ok ? data.currency : "GBP";
    try {
      return new Intl.NumberFormat(
        currency === "CAD" ? "en-CA" : currency === "USD" ? "en-US" : "en-GB",
        {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }
      ).format(value);
    } catch {
      const symbol = currency === "CAD" ? "CA$" : currency === "USD" ? "$" : "£";
      return `${symbol}${value.toFixed(2)}`;
    }
  };

  const fmtNumber = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    return String(value);
  };

  const fmtRange = (low: number | null, high: number | null) => {
    const lowText = fmtMoney(low);
    const highText = fmtMoney(high);
    if (lowText !== "—" && highText !== "—" && low === high) return lowText;
    if (lowText !== "—" && highText !== "—") return `${lowText}–${highText}`;
    if (lowText !== "—") return lowText;
    if (highText !== "—") return highText;
    return "—";
  };

  const fmtDate = (value: string | null) => {
    if (!value) return "—";
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return value;
    return new Date(ts).toLocaleString();
  };

  const decisionHeadline = () => {
    if (!data || !data.ok) return "Decision panel";
    if (hasUpdating) return "Decision panel (data still syncing)";
    return "Decision panel";
  };

  useEffect(() => {
    if (!productId || !data || !data.ok || !hasUpdating) return;
    if (refreshRequestedRef.current) return;
    refreshRequestedRef.current = true;
    setRefreshing(true);
    fetch("/api/white-label/insights/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    })
      .catch(() => null)
      .finally(() => setRefreshing(false));
  }, [productId, data, hasUpdating]);

  useEffect(() => {
    if (!productId || !hasUpdating) return;
    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(() => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > 18) {
        clearInterval(interval);
        if (!cancelled) setUpdateStalled(true);
        return;
      }
      fetch(`/api/white-label/insights?product_id=${encodeURIComponent(String(productId))}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((json: InsightsResponse) => {
          if (cancelled) return;
          setData(json);
          if (json && (json as any).ok) {
            const metrics = (json as any).metrics || {};
            const stillUpdating =
              metrics.trend_30 == null ||
              metrics.trend_90 == null ||
              metrics.offer_count == null ||
              metrics.seasonality == null ||
              metrics.buy_box_stability == null;
            if (!stillUpdating) {
              setUpdateStalled(false);
              clearInterval(interval);
            }
          }
        })
        .catch(() => null);
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [productId, hasUpdating]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-8 rounded-[28px] border border-[rgba(45,52,97,0.16)] bg-[radial-gradient(circle_at_top_left,rgba(45,52,97,0.16),transparent_60%),linear-gradient(135deg,rgba(45,52,97,0.06),rgba(255,255,255,0.9))] p-6 shadow-[0_20px_50px_rgba(45,52,97,0.18)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--agent-blue)]">
              White label
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-neutral-900 sm:text-4xl">
              Premium product insights
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-neutral-600 sm:text-base">
              Real signals for this product — explained in plain English.
            </p>
          </div>
          <Link
            href="/white-label/ideas"
            className="rounded-full border border-neutral-200 bg-white px-5 py-2 text-xs font-semibold text-neutral-700"
          >
            Back to ideas
          </Link>
        </div>
      </div>

      {!productId ? (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          This page needs a product. Return to the product detail page and click View insights.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Loading insights…
        </div>
      ) : null}

      {err ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 shadow-sm">
          {err}
        </div>
      ) : null}

      {showBlocked ? (
        <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">Access</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                {blockedCode === "insights_limit_reached" ? "Daily limit reached" : "Subscription required"}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-neutral-600">
                {blockedCode === "insights_limit_reached"
                  ? "You've reached today's free premium insights limit. Try again tomorrow or subscribe for unlimited access."
                  : "Premium insights are available only to active subscribers."}
              </p>
            </div>
            <div className="rounded-2xl border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.05)] px-4 py-3 text-xs text-[var(--agent-blue)]">
              Instant access after payment
            </div>
          </div>
          {blockedCode === "subscription_unavailable" ? (
            <p className="mt-3 text-sm text-amber-700">
              Insights are not available in your country yet.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/white-label/subscribe" className="btn btn-primary px-6 py-3 text-sm">
              Subscribe
            </Link>
            <Link href="/white-label/ideas" className="btn btn-outline px-6 py-3 text-sm">
              View ideas
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && !err && data && data.ok ? (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
                {data.product.image_url ? (
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 sm:mx-0">
                    <img
                      src={data.product.image_url}
                      alt={data.product.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-400 sm:mx-0">
                    No image
                  </div>
                )}
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">
                    {data.product.category || "Product"}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-neutral-900">{data.product.name}</h2>
                  {data.product.short_desc ? (
                    <p className="mt-2 text-sm text-neutral-600">{data.product.short_desc}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)] sm:p-8">
              <h2 className="text-lg font-semibold text-neutral-900">Insights for this product</h2>
              <p className="mt-2 text-sm text-neutral-600">
                These signals are based on recent market behavior for this exact product.
              </p>
              {hasUpdating ? (
                <p className="mt-3 text-xs text-neutral-500">
                  {updateStalled
                    ? "Some signals are not available yet for this product."
                    : "Updating means our data refresh is still in progress. Check back shortly for the latest signals."}
                </p>
              ) : null}
              {refreshing ? (
                <p className="mt-2 text-xs font-semibold text-[var(--agent-blue)]">Refreshing data now…</p>
              ) : null}
              {data.note ? (
                <p className="mt-3 text-xs font-semibold text-amber-700">{data.note}</p>
              ) : null}
            </div>

            <div className="grid gap-4">
              <div className="rounded-[24px] border border-[rgba(45,52,97,0.16)] bg-white p-5 shadow-[0_12px_26px_rgba(45,52,97,0.08)] lg:w-fit lg:max-w-full lg:justify-self-start">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                      Amazon price vs landed cost
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-neutral-500">Amazon price range</p>
                        <p className="font-semibold text-neutral-900">
                          {fmtRange(raw?.price_low ?? null, raw?.price_high ?? null)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-neutral-500">Estimated landed cost</p>
                        <p className="font-semibold text-neutral-900">
                          {fmtRange(raw?.landed_per_unit_low ?? null, raw?.landed_per_unit_high ?? null)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-[26px] border border-[rgba(45,52,97,0.18)] bg-[radial-gradient(circle_at_top_left,rgba(45,52,97,0.18),transparent_55%),linear-gradient(135deg,#ffffff,rgba(45,52,97,0.08))] p-5 shadow-[0_20px_45px_rgba(45,52,97,0.18)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center rounded-full border border-[rgba(45,52,97,0.2)] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--agent-blue)]">
                      {decisionHeadline()}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-neutral-900">
                      {data.metrics.trend_30 != null ? `${trendSentence(data.metrics.trend_30)} (30d)` : updatingLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-600">
                      {data.metrics.offer_count != null
                        ? `${data.metrics.offer_count} active offers`
                        : "Competition data pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-white/90 px-3 py-1 text-[11px] font-semibold text-neutral-700">
                      <span className="h-2 w-2 rounded-full bg-[var(--agent-blue)]" />
                      Market: {data.market}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-white/90 px-3 py-1 text-[11px] font-semibold text-neutral-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Currency: {data.currency}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-[11px] text-neutral-700 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                    <span className="font-semibold text-neutral-800">Price direction:</span>{" "}
                    {data.metrics.trend_90 != null ? trendSentence(data.metrics.trend_90) : updatingLabel}
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                    <span className="font-semibold text-neutral-800">Seasonality:</span>{" "}
                    {data.metrics.seasonality != null ? volatilityLabel(data.metrics.seasonality) : updatingLabel}
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                    <span className="font-semibold text-neutral-800">Buy‑box:</span>{" "}
                    {data.metrics.buy_box_stability || updatingLabel}
                  </div>
                  <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                    <span className="font-semibold text-neutral-800">Last checked:</span>{" "}
                    {fmtDate(raw?.last_checked_at ?? null)}
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-neutral-600">
                  Use this snapshot to decide if the product has margin headroom and manageable competition.
                </p>
              </div>
              <div className="rounded-[24px] border border-[rgba(45,52,97,0.16)] bg-white p-5 shadow-[0_12px_26px_rgba(45,52,97,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                      Price trend
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-neutral-500">30 days</p>
                        <p className="font-semibold text-neutral-900">{trendSentence(data.metrics.trend_30)}</p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Shows if prices are rising or falling recently.
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-neutral-500">90 days</p>
                        <p className="font-semibold text-neutral-900">{trendSentence(data.metrics.trend_90)}</p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Confirms the longer‑term direction.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] text-neutral-600">
                  <summary className="cursor-pointer text-[11px] font-semibold text-neutral-700">
                    Price trend details
                  </summary>
                  <div className="mt-3 grid gap-2 text-[11px] text-neutral-600 sm:grid-cols-2">
                    <div>Current price: {fmtMoney(raw?.price_current ?? null)}</div>
                    <div>30‑day average: {fmtMoney(raw?.price_avg30 ?? null)}</div>
                    <div>90‑day average: {fmtMoney(raw?.price_avg90 ?? null)}</div>
                    <div>Last checked: {fmtDate(raw?.last_checked_at ?? null)}</div>
                  </div>
                </details>
              </div>

              <div className="rounded-[24px] border border-[rgba(45,52,97,0.16)] bg-white p-5 shadow-[0_12px_26px_rgba(45,52,97,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                      Competition
                    </p>
                    <p className="mt-3 text-sm font-semibold text-neutral-900">
                      {data.metrics.offer_count != null
                        ? `${data.metrics.offer_count} active offers`
                        : updatingLabel}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      More sellers usually means tougher competition.
                    </p>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] text-neutral-600">
                  <summary className="cursor-pointer text-[11px] font-semibold text-neutral-700">
                    Competition details
                  </summary>
                  <div className="mt-3 grid gap-2 text-[11px] text-neutral-600 sm:grid-cols-2">
                    <div>Offer count: {fmtNumber(raw?.offer_count ?? null)}</div>
                    <div>Last checked: {fmtDate(raw?.last_checked_at ?? null)}</div>
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    Offer count reflects active offers for this ASIN at the last check. Single‑seller listings are
                    common for brand‑restricted products.
                  </p>
                </details>
              </div>

              <div className="rounded-[24px] border border-[rgba(45,52,97,0.16)] bg-white p-5 shadow-[0_12px_26px_rgba(45,52,97,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                      Seasonality
                    </p>
                    <p className="mt-3 text-sm font-semibold text-neutral-900">
                      {data.metrics.seasonality != null
                        ? volatilityLabel(data.metrics.seasonality)
                        : updatingLabel}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      High swings mean demand changes more by season.
                    </p>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] text-neutral-600">
                  <summary className="cursor-pointer text-[11px] font-semibold text-neutral-700">
                    Seasonality details
                  </summary>
                  <div className="mt-3 grid gap-2 text-[11px] text-neutral-600 sm:grid-cols-2">
                    <div>Min price: {fmtMoney(raw?.price_min ?? null)}</div>
                    <div>Max price: {fmtMoney(raw?.price_max ?? null)}</div>
                    <div>90‑day average: {fmtMoney(raw?.price_avg90 ?? null)}</div>
                    <div>Last checked: {fmtDate(raw?.last_checked_at ?? null)}</div>
                  </div>
                </details>
              </div>

              <div className="rounded-[24px] border border-[rgba(45,52,97,0.16)] bg-white p-5 shadow-[0_12px_26px_rgba(45,52,97,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                      Buy‑box stability
                    </p>
                    <p className="mt-3 text-sm font-semibold text-neutral-900">
                      {data.metrics.buy_box_stability || updatingLabel}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      Stable means pricing stays steady. Volatile means it changes often.
                    </p>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] text-neutral-600">
                  <summary className="cursor-pointer text-[11px] font-semibold text-neutral-700">
                    Buy‑box stability details
                  </summary>
                  <div className="mt-3 grid gap-2 text-[11px] text-neutral-600 sm:grid-cols-2">
                    <div>Min price: {fmtMoney(raw?.price_min ?? null)}</div>
                    <div>Max price: {fmtMoney(raw?.price_max ?? null)}</div>
                    <div>90‑day average: {fmtMoney(raw?.price_avg90 ?? null)}</div>
                    <div>Last checked: {fmtDate(raw?.last_checked_at ?? null)}</div>
                  </div>
                </details>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(45,52,97,0.16)] bg-[linear-gradient(180deg,rgba(45,52,97,0.08),rgba(255,255,255,0.95))] p-6 shadow-[0_18px_36px_rgba(45,52,97,0.12)] sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">How to use this</p>
            <div className="mt-4 rounded-[22px] border border-white/80 bg-white/80 p-5 shadow-[0_12px_24px_rgba(45,52,97,0.12)] backdrop-blur">
              <h3 className="text-sm font-semibold text-neutral-900">Quick decision guide</h3>
              <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                <li>Rising prices + low competition = strong margin potential.</li>
                <li>Falling prices + many sellers = consider differentiation.</li>
                <li>High seasonality = plan inventory timing carefully.</li>
              </ul>
            </div>
            <div className="mt-4 rounded-[22px] border border-white/80 bg-white/80 p-5 shadow-[0_12px_24px_rgba(45,52,97,0.12)] backdrop-blur">
              <h3 className="text-sm font-semibold text-neutral-900">Market</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Showing {data.market} signals ({data.currency}).
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
