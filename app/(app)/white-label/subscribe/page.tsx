"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

type Config = {
  trial_days: number;
  daily_reveals: number;
  monthly_price_gbp: number | null;
  yearly_price_gbp: number | null;
  monthly_price_cad: number | null;
  yearly_price_cad: number | null;
  monthly_price_usd: number | null;
  yearly_price_usd: number | null;
  monthly_price: number | null;
  yearly_price: number | null;
  currency: "GBP" | "CAD" | "USD";
  country_iso2?: string | null;
  amazon_enabled?: boolean;
  subscription_eligible?: boolean;
};

type Profile = {
  white_label_trial_ends_at?: string | null;
  white_label_plan?: string | null;
  white_label_subscription_status?: string | null;
  white_label_subscription_provider?: string | null;
  white_label_subscription_id?: string | null;
  white_label_next_billing_at?: string | null;
  white_label_exempt?: {
    starts_at: string;
    ends_at: string;
    source?: string | null;
    notes?: string | null;
  } | null;
};

function fmt(amount: number | null, currency: "GBP" | "CAD" | "USD") {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    const locale = currency === "GBP" ? "en-GB" : currency === "CAD" ? "en-CA" : "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = currency === "GBP" ? "£" : currency === "CAD" ? "CA$" : "$";
    return `${symbol}${Number(amount).toFixed(2)}`;
  }
}

export default function WhiteLabelSubscribePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"monthly" | "yearly" | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

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

  useEffect(() => {
    authFetch("/api/mobile/profile")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error || "Failed to load profile");
        setProfile(d);
      })
      .catch((e) => setProfileErr(e?.message || "Failed to load profile"));
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

  async function cancelSubscription() {
    const ok = window.confirm("Cancel at the end of your current billing period?");
    if (!ok) return;
    setCancelling(true);
    setCancelMsg(null);
    try {
      const res = await authFetch("/api/payments/paypal/subscription/cancel", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to cancel subscription.");
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              white_label_subscription_status: "cancelled",
              white_label_next_billing_at: data?.next_billing_at || prev.white_label_next_billing_at,
            }
          : prev
      );
      setCancelMsg("Your subscription will end after the current billing period.");
    } catch (e: any) {
      setCancelMsg(e?.message || "Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  }

  const trialActive = (() => {
    const end = profile?.white_label_trial_ends_at ? new Date(profile.white_label_trial_ends_at) : null;
    if (!end || Number.isNaN(end.valueOf())) return false;
    return new Date() <= end;
  })();
  const subscriptionActive =
    String(profile?.white_label_plan || "").toLowerCase() === "paid" &&
    String(profile?.white_label_subscription_status || "").toLowerCase() === "active";
  const cancelledActive = (() => {
    if (!profile?.white_label_next_billing_at) return false;
    const end = new Date(profile.white_label_next_billing_at);
    if (Number.isNaN(end.valueOf())) return false;
    return (
      String(profile?.white_label_plan || "").toLowerCase() === "paid" &&
      String(profile?.white_label_subscription_status || "").toLowerCase() === "cancelled" &&
      new Date() <= end
    );
  })();
  const exemptionActive = (() => {
    const end = profile?.white_label_exempt?.ends_at ? new Date(profile.white_label_exempt.ends_at) : null;
    if (!end || Number.isNaN(end.valueOf())) return false;
    return new Date() <= end;
  })();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h1 className="text-2xl font-semibold text-neutral-900">White label subscription</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Unlock Amazon comparison and premium insights for every white label idea.
        </p>

        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Your access</p>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                subscriptionActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : cancelledActive
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : exemptionActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : trialActive
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              {subscriptionActive
                ? "Active"
                : cancelledActive
                ? "Canceling"
                : exemptionActive
                ? "Exempted"
                : trialActive
                ? "Trial"
                : "Not active"}
            </span>
          </div>
          {subscriptionActive || cancelledActive ? (
            <div className="mt-2 text-xs text-neutral-500">
              {cancelledActive ? "Access ends" : "Next billing date"}:{" "}
              {profile?.white_label_next_billing_at
                ? new Date(profile.white_label_next_billing_at).toLocaleDateString()
                : "—"}
            </div>
          ) : trialActive ? (
            <div className="mt-2 text-xs text-neutral-500">
              Trial ends {profile?.white_label_trial_ends_at ? new Date(profile.white_label_trial_ends_at).toLocaleDateString() : "—"}.
            </div>
          ) : null}
          {profileErr ? <div className="mt-2 text-xs text-amber-700">{profileErr}</div> : null}
          {subscriptionActive || cancelledActive ? (
            <details className="mt-3 text-xs text-neutral-600">
              <summary className="cursor-pointer text-[11px] font-semibold text-neutral-500">
                Manage plan
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={cancelSubscription}
                  disabled={cancelling || cancelledActive}
                  className="text-[11px] text-neutral-500 hover:text-neutral-700 disabled:opacity-60"
                >
                  {cancelledActive ? "Cancellation scheduled" : cancelling ? "Canceling..." : "Cancel subscription"}
                </button>
                {cancelMsg ? <span className="text-[11px] text-neutral-500">{cancelMsg}</span> : null}
              </div>
            </details>
          ) : null}
        </div>

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
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{fmt(config.monthly_price, config.currency)}</div>
              <button
                type="button"
                onClick={() => startSubscription("monthly")}
                disabled={submitting === "monthly" || config.subscription_eligible === false}
                className="btn btn-primary mt-4 w-full px-4 py-3 text-sm disabled:opacity-60"
              >
                {submitting === "monthly" ? "Redirecting…" : "Subscribe monthly"}
              </button>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-sm font-semibold text-neutral-900">Yearly</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{fmt(config.yearly_price, config.currency)}</div>
              <button
                type="button"
                onClick={() => startSubscription("yearly")}
                disabled={submitting === "yearly" || config.subscription_eligible === false}
                className="btn btn-outline mt-4 w-full px-4 py-3 text-sm disabled:opacity-60"
              >
                {submitting === "yearly" ? "Redirecting…" : "Subscribe yearly"}
              </button>
            </div>
          </div>
        ) : null}
        {config && config.subscription_eligible === false ? (
          <p className="mt-4 text-xs text-amber-700">
            Subscription pricing is only available for countries with Amazon reveal enabled.
            {config.country_iso2 ? ` Current country: ${config.country_iso2}.` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
