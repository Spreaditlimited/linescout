"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ShieldCheck, TrendingUp, Users } from "lucide-react";

type InsightsResponse =
  | {
      ok: true;
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
    }
  | { ok: false; code?: string; error?: string };

function trendSentence(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Pending";
  if (value > 0) return "Prices rising";
  if (value < 0) return "Prices falling";
  return "Prices steady";
}

function volatilityLabel(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Pending";
  if (value >= 20) return `High swings (${value}%)`;
  if (value >= 8) return `Medium swings (${value}%)`;
  return `Low swings (${value}%)`;
}

export default function WhiteLabelInsights({ productId }: { productId: number }) {
  const [state, setState] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnOpen, setLearnOpen] = useState(false);
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setIsLocal(host === "localhost" || host === "127.0.0.1");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/white-label/insights?product_id=${encodeURIComponent(String(productId))}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        setState(json);
      })
      .catch(() => {
        if (!active) return;
        setState({ ok: false, error: "Failed to load insights." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="h-5 w-40 rounded-full bg-neutral-100" />
        <div className="mt-3 h-4 w-60 rounded-full bg-neutral-100" />
      </div>
    );
  }

  if (!state || !state.ok) {
    const code = (state as any)?.code;
    return (
      <div className="rounded-[24px] border border-[rgba(45,52,97,0.18)] bg-gradient-to-br from-white via-white to-[rgba(45,52,97,0.08)] p-6 shadow-[0_16px_40px_rgba(45,52,97,0.14)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.12)] text-[var(--agent-blue)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Premium product insights</p>
            <p className="text-xs text-neutral-500">
              {code === "subscription_unavailable"
                ? "Insights are not available in your country yet."
                : code === "insights_limit_reached"
                ? "Daily free insights limit reached. Try again tomorrow."
                : "Plain‑English market signals for pricing and demand."}
            </p>
          </div>
        </div>
        {code !== "subscription_unavailable" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {isLocal ? (
              <Link
                href={`/white-label/insights?product_id=${encodeURIComponent(String(productId))}`}
                className="inline-flex whitespace-nowrap rounded-2xl border border-[rgba(45,52,97,0.24)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
              >
                Learn more
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setLearnOpen(true)}
                className="inline-flex whitespace-nowrap rounded-2xl border border-[rgba(45,52,97,0.24)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
              >
                Learn more
              </button>
            )}
            <Link
              href="/white-label/subscribe"
              className="inline-flex whitespace-nowrap rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white"
            >
              Subscribe
            </Link>
          </div>
        ) : null}

        {!isLocal && learnOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <button
              aria-label="Close insights modal"
              className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
              onClick={() => setLearnOpen(false)}
            />
            <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
              <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                      Premium product insights
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                      What you get
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-600"
                    onClick={() => setLearnOpen(false)}
                  >
                    <span className="sr-only">Close</span>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="mt-3 text-sm text-neutral-600">
                  Simple signals that explain pricing, competition, and seasonality in plain English.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Price trend</p>
                    <p className="mt-2 text-sm text-neutral-700">
                      Shows if prices are rising, falling, or steady.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Competition</p>
                    <p className="mt-2 text-sm text-neutral-700">
                      Shows how many active sellers are in the market.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Seasonality</p>
                    <p className="mt-2 text-sm text-neutral-700">
                      Indicates whether demand swings by season.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Buy‑box stability</p>
                    <p className="mt-2 text-sm text-neutral-700">
                      Shows if pricing is steady or changing often.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setLearnOpen(false)}
                  className="btn btn-outline px-4 py-2 text-xs"
                >
                  Close
                </button>
                <Link href="/white-label/subscribe" className="btn btn-primary px-4 py-2 text-xs">
                  Subscribe
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-[rgba(45,52,97,0.2)] bg-gradient-to-br from-white via-white to-[rgba(45,52,97,0.08)] p-6 shadow-[0_18px_44px_rgba(45,52,97,0.15)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Product insights</p>
          <h3 className="mt-2 text-lg font-semibold text-neutral-900">
            Premium market signals ({state.market})
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Plain‑English signals that explain pricing and demand.
          </p>
        </div>
        {state.note ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
            {state.note}
          </span>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-[0_10px_24px_rgba(45,52,97,0.12)] backdrop-blur">
        <p className="text-sm text-neutral-600">
          View the full insights breakdown (with examples) on the Insights page.
        </p>
        <Link
          href={`/white-label/insights?product_id=${encodeURIComponent(String(productId))}`}
          className="btn btn-primary mt-4 px-5 py-2 text-xs"
        >
          View insights
        </Link>
      </div>
    </div>
  );
}
