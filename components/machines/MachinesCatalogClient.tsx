"use client";

import { useMemo } from "react";
import Link from "next/link";

type MachineItem = {
  id: number;
  machine_name: string;
  category: string;
  short_desc: string | null;
  image_url: string | null;
  slug?: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  landed_ngn_low?: number | null;
  landed_ngn_high?: number | null;
};

function formatNaira(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `₦${Math.round(value).toLocaleString()}`;
}

function formatUsd(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

function initials(name?: string | null) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "MC";
  const parts = cleaned.split(" ");
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (first + second).toUpperCase() || "MC";
}

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function MachinesCatalogClient({
  items,
  detailBase = "/machines",
}: {
  items: MachineItem[];
  detailBase?: string;
}) {
  const normalizedBase = detailBase.endsWith("/") ? detailBase.slice(0, -1) : detailBase;

  const itemLinks = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        detailHref: `${normalizedBase}/${item.slug || slugify(item.machine_name)}`,
      })),
    [items, normalizedBase]
  );

  return (
    <div className="grid gap-6 md:grid-cols-4">
      {itemLinks.length ? (
        itemLinks.map((item) => (
          <div
            key={`${item.id}-${item.machine_name}`}
            className="flex h-full flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
          >
            <div className="relative h-52 w-full border-b border-neutral-100 bg-[#F2F3F5] p-4">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={`${item.machine_name} machine`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="h-24 w-24 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-center">
                    <div className="pt-3 text-[10px] font-semibold text-emerald-700">YOUR LOGO</div>
                    <div className="mt-1 text-[11px] font-semibold text-neutral-700">
                      {initials(item.machine_name)}
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
                {item.machine_name}
              </h2>
              <p className="mt-3 text-sm text-neutral-600">
                {formatNaira(item.landed_ngn_low)}–{formatNaira(item.landed_ngn_high)} landed (Lagos)
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatUsd(item.fob_low_usd)}–{formatUsd(item.fob_high_usd)} FOB + sea freight (last‑mile excluded)
              </p>
            </div>

            <div className="mt-auto px-5 pb-6">
              <Link
                href={item.detailHref}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700"
              >
                View detail
              </Link>
              <Link
                href={`/sourcing-project?route_type=machine_sourcing&machine_id=${encodeURIComponent(
                  String(item.id)
                )}&machine_name=${encodeURIComponent(
                  item.machine_name
                )}&machine_category=${encodeURIComponent(
                  item.category
                )}&machine_landed_ngn=${encodeURIComponent(
                  `${formatNaira(item.landed_ngn_low)}–${formatNaira(item.landed_ngn_high)}`
                )}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-3 text-sm font-semibold text-white"
              >
                Start sourcing
              </Link>
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          No machines matched your search. Try a different keyword or category.
        </div>
      )}
    </div>
  );
}

