"use client";

import { useEffect, useState } from "react";
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
      market: "UK" | "CA";
      currency: "GBP" | "CAD";
      note?: string | null;
      metrics: {
        trend_30: number | null;
        trend_90: number | null;
        offer_count: number | null;
        seasonality: number | null;
        buy_box_stability: string | null;
      };
    }
  | { ok: false; code?: string; error?: string };

export default function WhiteLabelInsightsInfoPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [allowLocal, setAllowLocal] = useState(false);

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
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Subscription required</h2>
              <p className="mt-2 max-w-xl text-sm text-neutral-600">
                Premium insights are available only to active subscribers.
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
              <div className="flex flex-wrap items-center gap-5">
                {data.product.image_url ? (
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                    <img
                      src={data.product.image_url}
                      alt={data.product.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-400">
                    No image
                  </div>
                )}
                <div className="flex-1">
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
                  Updating means our data refresh is still in progress. Check back shortly for the latest signals.
                </p>
              ) : null}
              {data.note ? (
                <p className="mt-3 text-xs font-semibold text-amber-700">{data.note}</p>
              ) : null}
            </div>

            <div className="grid gap-4">
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
                      {data.metrics.offer_count != null ? `${data.metrics.offer_count} active offers` : "Updating"}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      More sellers usually means tougher competition.
                    </p>
                  </div>
                </div>
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
                      {volatilityLabel(data.metrics.seasonality)}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      High swings mean demand changes more by season.
                    </p>
                  </div>
                </div>
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
                      {data.metrics.buy_box_stability || "Updating"}
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      Stable means pricing stays steady. Volatile means it changes often.
                    </p>
                  </div>
                </div>
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
