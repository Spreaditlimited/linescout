"use client";

import { useEffect, useState } from "react";

type Summary = {
  total_earned: number;
  total_paid: number;
  total_locked: number;
  available: number;
};

type Earning = {
  id: number;
  referred_user_id: number;
  transaction_type: string;
  base_amount: number;
  commission_amount: number;
  currency: string;
  status: string;
  created_at: string;
};

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
}

export default function AffiliateDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const meRes = await fetch("/api/affiliates/me", { cache: "no-store" });
        const meJson = await meRes.json().catch(() => null);
        if (!meRes.ok || !meJson?.ok) throw new Error(meJson?.error || "Failed to load profile");
        if (active) setReferralCode(meJson?.affiliate?.referral_code || null);

        const sumRes = await fetch("/api/affiliates/earnings/summary", { cache: "no-store" });
        const sumJson = await sumRes.json().catch(() => null);
        if (!sumRes.ok || !sumJson?.ok) throw new Error(sumJson?.error || "Failed to load summary");
        if (active) setSummary(sumJson.summary || null);

        const actRes = await fetch("/api/affiliates/earnings/activity?limit=20&cursor=0", { cache: "no-store" });
        const actJson = await actRes.json().catch(() => null);
        if (!actRes.ok || !actJson?.ok) throw new Error(actJson?.error || "Failed to load activity");
        if (active) setItems(Array.isArray(actJson.items) ? actJson.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">Loading…</div>
    );
  }

  if (err) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">{err}</div>
    );
  }

  const currency = items?.[0]?.currency || "USD";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Referral link</p>
        <p className="mt-2 text-sm text-neutral-600">
          Share this link. Referrals are permanently attached once they sign up using it.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700">
          <span className="break-all">
            {referralCode
              ? `https://linescout.sureimports.com/affiliates/${referralCode.toLowerCase()}`
              : "Loading…"}
          </span>
          {referralCode ? (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `https://linescout.sureimports.com/affiliates/${referralCode.toLowerCase()}`
                  );
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
              className="rounded-2xl border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-600 hover:border-neutral-300"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Total earned</p>
          <p className="mt-3 text-xl font-semibold text-neutral-900">{fmtMoney(summary?.total_earned || 0, currency)}</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Available</p>
          <p className="mt-3 text-xl font-semibold text-neutral-900">{fmtMoney(summary?.available || 0, currency)}</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Locked</p>
          <p className="mt-3 text-xl font-semibold text-neutral-900">{fmtMoney(summary?.total_locked || 0, currency)}</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Paid out</p>
          <p className="mt-3 text-xl font-semibold text-neutral-900">{fmtMoney(summary?.total_paid || 0, currency)}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Recent earnings</p>
        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-sm text-neutral-500">No earnings yet.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--agent-blue)]">
                    {item.transaction_type.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-neutral-500">User #{item.referred_user_id}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-neutral-900">{fmtMoney(item.commission_amount, item.currency)}</div>
                  <div className="text-xs text-neutral-500">Base: {fmtMoney(item.base_amount, item.currency)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
