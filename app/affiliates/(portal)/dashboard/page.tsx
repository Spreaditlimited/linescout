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

type PromoVideo = { title: string; url: string | null };

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
  const [promoVideos, setPromoVideos] = useState<PromoVideo[]>([]);

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

        const metaRes = await fetch("/api/affiliates/metadata", { cache: "no-store" });
        const metaJson = await metaRes.json().catch(() => null);
        if (metaRes.ok && metaJson?.ok && active) {
          const videos = Array.isArray(metaJson.affiliate_promo_videos) ? metaJson.affiliate_promo_videos : [];
          setPromoVideos(
            videos.length
              ? videos
              : [
                  { title: "Starting a white label project from white label ideas", url: null },
                  { title: "Creating a white label brief and project on LineScout", url: null },
                  { title: "Creating a Simple Sourcing project", url: null },
                  { title: "Creating a Machine Sourcing project", url: null },
                ]
          );
        }

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
  const toEmbedUrl = (url?: string | null) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) {
        return `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}`;
      }
      if (parsed.hostname.includes("youtube.com")) {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : url;
      }
      return url;
    } catch {
      return url;
    }
  };

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

      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
          Understanding LineScout by Sure Imports
        </p>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Learn how LineScout works so you can guide your audience with confidence.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {promoVideos.map((video) => {
            const embedUrl = toEmbedUrl(video.url);
            return (
              <div key={video.title} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-sm font-semibold text-neutral-900">{video.title}</div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={video.title}
                      className="h-56 w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 via-white to-slate-200">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(45,52,97,0.12),_transparent_55%)]" />
                      <div className="relative flex flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-white/80 shadow-sm">
                          <div className="h-0 w-0 border-y-[8px] border-y-transparent border-l-[14px] border-l-[var(--agent-blue)]" />
                        </div>
                        <span className="rounded-full border border-neutral-200 bg-white/90 px-4 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
                          Coming soon
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
