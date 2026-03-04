"use client";

import { useEffect, useState } from "react";

type Referral = {
  id: number;
  referred_user_id: number;
  created_at: string;
  email: string | null;
};

export default function AffiliateReferralsPage() {
  const [items, setItems] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/affiliates/referrals?limit=50&cursor=0", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load referrals");
        if (active) setItems(Array.isArray(json.items) ? json.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load referrals");
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
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Referrals</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-neutral-500">No referrals yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm">
              <div>
                <div className="text-xs text-neutral-500">User #{item.referred_user_id}</div>
                <div className="text-sm font-semibold text-neutral-900">{item.email || "Email hidden"}</div>
              </div>
              <div className="text-xs text-neutral-500">
                {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

