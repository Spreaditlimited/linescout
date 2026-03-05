"use client";

import { useEffect, useState } from "react";

type PromoAsset = {
  id: string;
  platform: string;
  size: string;
  filename: string;
  headline: string;
  subhead: string;
  cta: string;
};

export default function AffiliatePromotionsPage() {
  const [promoAssets, setPromoAssets] = useState<PromoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const assetsRes = await fetch("/affiliate-assets/manifest.json", { cache: "no-store" });
        const assetsJson = await assetsRes.json().catch(() => null);
        if (!assetsRes.ok || !assetsJson?.items) throw new Error("Failed to load promotional assets");
        if (active) setPromoAssets(Array.isArray(assetsJson.items) ? assetsJson.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load promotions");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const promoSections = [
    {
      key: "Facebook + Instagram",
      label: "Square posts",
      size: "1080×1080",
      filter: (asset: PromoAsset) => asset.filename.startsWith("square/"),
    },
    {
      key: "Instagram + Facebook",
      label: "Stories",
      size: "1080×1920",
      filter: (asset: PromoAsset) => asset.filename.startsWith("story/"),
    },
    {
      key: "X + LinkedIn",
      label: "Landscape posts",
      size: "1200×628",
      filter: (asset: PromoAsset) => asset.filename.startsWith("landscape/"),
    },
    {
      key: "TikTok",
      label: "Cover / Story",
      size: "1080×1920",
      filter: (asset: PromoAsset) => asset.filename.startsWith("tiktok/"),
    },
  ];

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
        Loading promotions…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Promotions</p>
            <h3 className="mt-2 text-lg font-semibold text-neutral-900">Share LineScout, look premium everywhere.</h3>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Ready-to-share visuals for every platform. Download and post in seconds.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-600">
            Premium minimal templates
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {promoSections.map((section) => {
            const assets = promoAssets.filter(section.filter);
            return (
              <div key={section.key} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {section.key} · {section.label}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{section.size}</div>
                  </div>
                  <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-600">
                    {assets.length} assets
                  </div>
                </div>
                <div className="hide-scrollbar mt-4 max-h-[360px] overflow-y-auto pr-1 overscroll-contain">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {assets.map((asset) => (
                      <a
                        key={asset.id}
                        href={`/affiliate-assets/${asset.filename}`}
                        download
                        className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                        style={{ contentVisibility: "auto", containIntrinsicSize: "112px 112px" }}
                      >
                        <img
                          src={`/affiliate-assets/${asset.filename}`}
                          alt={asset.headline}
                          loading="lazy"
                          decoding="async"
                          className="h-28 w-full bg-white object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-neutral-700 shadow-sm">
                          Download
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
