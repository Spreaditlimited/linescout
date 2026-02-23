"use client";

import { useEffect, useState } from "react";

type Config = {
  trial_days: number;
  daily_reveals: number;
  monthly_price_gbp: number | null;
  yearly_price_gbp: number | null;
  monthly_price_cad: number | null;
  yearly_price_cad: number | null;
};

function fmt(amount: number | null, currency: "GBP" | "CAD") {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-CA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = currency === "GBP" ? "£" : "CA$";
    return `${symbol}${Number(amount).toFixed(2)}`;
  }
}

export default function WhiteLabelSubscribePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"monthly" | "yearly" | null>(null);

  useEffect(() => {
    fetch("/api/white-label/subscription/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error || "Failed to load");
        setConfig(d);
      })
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function startSubscription(period: "monthly" | "yearly") {
    setSubmitting(period);
    setErr(null);
    try {
      const callback = `${window.location.origin}/white-label/subscribe`;
      const res = await fetch("/api/payments/paypal/subscription/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, callback_url: callback }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to start subscription");
      if (data?.approval_url) {
        window.location.href = data.approval_url;
        return;
      }
      throw new Error("PayPal approval URL missing.");
    } catch (e: any) {
      setErr(e?.message || "Failed to start subscription");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h1 className="text-2xl font-semibold text-neutral-900">White label subscription</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Unlock Amazon comparison and premium insights for every white label idea.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading pricing…</p>
        ) : null}
        {err ? (
          <p className="mt-4 text-sm text-amber-700">{err}</p>
        ) : null}

        {config ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-sm font-semibold text-neutral-900">Monthly</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">
                {fmt(config.monthly_price_gbp, "GBP")} / {fmt(config.monthly_price_cad, "CAD")}
              </div>
              <button
                type="button"
                onClick={() => startSubscription("monthly")}
                disabled={submitting === "monthly"}
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting === "monthly" ? "Redirecting…" : "Subscribe monthly"}
              </button>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-sm font-semibold text-neutral-900">Yearly</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">
                {fmt(config.yearly_price_gbp, "GBP")} / {fmt(config.yearly_price_cad, "CAD")}
              </div>
              <button
                type="button"
                onClick={() => startSubscription("yearly")}
                disabled={submitting === "yearly"}
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 disabled:opacity-60"
              >
                {submitting === "yearly" ? "Redirecting…" : "Subscribe yearly"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
