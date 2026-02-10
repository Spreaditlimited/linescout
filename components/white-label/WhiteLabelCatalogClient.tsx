"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ProductItem = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  landed_ngn_per_unit_low?: number | null;
  landed_ngn_per_unit_high?: number | null;
  landed_ngn_total_1000_low?: number | null;
  landed_ngn_total_1000_high?: number | null;
};

function formatNaira(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `₦${Math.round(value).toLocaleString()}`;
}

function formatPerUnitRange(low?: number | null, high?: number | null) {
  const lowText = formatNaira(low);
  const highText = formatNaira(high);
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} per unit`;
  if (lowText !== "—") return `${lowText} per unit`;
  if (highText !== "—") return `${highText} per unit`;
  return "";
}

function initials(name?: string | null) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "WL";
  const parts = cleaned.split(" ");
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (first + second).toUpperCase() || "WL";
}

function categoryColor(category?: string | null) {
  const c = String(category || "").toLowerCase();
  if (c.includes("phone") || c.includes("computer")) return "#DDEAFE";
  if (c.includes("tech")) return "#E6F6F0";
  if (c.includes("fitness")) return "#FFF1E1";
  return "#EEF2FF";
}

export default function WhiteLabelCatalogClient({ items }: { items: ProductItem[] }) {
  const [selected, setSelected] = useState<ProductItem | null>(null);

  const selectedPreview = useMemo(() => {
    if (!selected) return "";
    const text = selected.short_desc || selected.why_sells || "Market-ready product idea.";
    return String(text || "").trim();
  }, [selected]);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        {items.length ? (
          items.map((item) => (
            <div
              key={`${item.id}-${item.product_name}`}
              className="flex h-full flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="relative h-52 w-full border-b border-neutral-100 bg-[#F7F8FB] p-4">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={`${item.product_name} white label idea`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="h-24 w-24 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-center">
                      <div className="pt-3 text-[10px] font-semibold text-emerald-700">YOUR LOGO</div>
                      <div className="mt-1 text-[11px] font-semibold text-neutral-700">
                        {initials(item.product_name)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  {item.category}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                  {item.product_name}
                </h2>
                <p className="mt-3 text-sm text-neutral-600">
                  {formatNaira(item.landed_ngn_per_unit_low)}–{formatNaira(item.landed_ngn_per_unit_high)} per unit
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatNaira(item.landed_ngn_total_1000_low)}–{formatNaira(item.landed_ngn_total_1000_high)} for
                  1,000 units
                </p>
              </div>

              <div className="mt-auto px-5 pb-6">
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700"
                >
                  View detail
                </button>
                <Link
                  href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(item.id))}&product_name=${encodeURIComponent(item.product_name)}&product_category=${encodeURIComponent(item.category)}&product_landed_ngn_per_unit=${encodeURIComponent(formatPerUnitRange(item.landed_ngn_per_unit_low, item.landed_ngn_per_unit_high))}`}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-3 text-sm font-semibold text-white"
                >
                  Start sourcing
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            No ideas matched your search. Try a different keyword or category.
          </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelected(null)}
            aria-label="Close"
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-2xl">
            <div
              className="flex h-48 w-full items-center justify-center"
              style={{ backgroundColor: categoryColor(selected.category) }}
            >
              {selected.image_url ? (
                <img
                  src={selected.image_url}
                  alt={selected.product_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-28 w-28 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-center">
                  <div className="pt-4 text-[10px] font-semibold text-emerald-700">YOUR LOGO</div>
                  <div className="mt-1 text-[12px] font-semibold text-neutral-700">
                    {initials(selected.product_name)}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 pt-5">
              <h3 className="text-xl font-semibold text-neutral-900">{selected.product_name}</h3>
              <p className="mt-1 text-sm text-neutral-500">{selected.category}</p>
              <p className="mt-4 text-sm text-neutral-600">{selectedPreview}</p>
              {selected.why_sells ? (
                <p className="mt-3 text-sm text-neutral-600">Why it sells: {selected.why_sells}</p>
              ) : null}
              {selected.regulatory_note ? (
                <p className="mt-3 text-sm text-neutral-600">
                  Regulatory note: {selected.regulatory_note}
                </p>
              ) : null}
              <div className="mt-5 text-sm font-semibold text-neutral-900">
                {formatNaira(selected.landed_ngn_per_unit_low)}–{formatNaira(selected.landed_ngn_per_unit_high)} per unit
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {formatNaira(selected.landed_ngn_total_1000_low)}–{formatNaira(selected.landed_ngn_total_1000_high)} for
                1,000 units
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm font-semibold text-neutral-500"
                >
                  Close
                </button>
                <Link
                  href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(selected.id))}&product_name=${encodeURIComponent(selected.product_name)}&product_category=${encodeURIComponent(selected.category)}&product_landed_ngn_per_unit=${encodeURIComponent(formatPerUnitRange(selected.landed_ngn_per_unit_low, selected.landed_ngn_per_unit_high))}`}
                  className="rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-sm font-semibold text-white"
                >
                  Start sourcing
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
