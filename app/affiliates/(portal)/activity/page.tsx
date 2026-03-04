"use client";

import { useEffect, useState } from "react";

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

export default function AffiliateActivityPage() {
  const [items, setItems] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/affiliates/earnings/activity?limit=50&cursor=0", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load activity");
        if (active) setItems(Array.isArray(json.items) ? json.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load activity");
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

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Activity</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-neutral-500">No activity yet.</div>
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
  );
}

