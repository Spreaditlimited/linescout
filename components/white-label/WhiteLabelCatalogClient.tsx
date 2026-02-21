"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  currencyForCode,
  formatCurrency,
  pickLandedFieldsByCurrency,
} from "@/lib/white-label-country";

type ProductItem = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  slug?: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  landed_ngn_per_unit_low?: number | null;
  landed_ngn_per_unit_high?: number | null;
  landed_ngn_total_1000_low?: number | null;
  landed_ngn_total_1000_high?: number | null;
  landed_gbp_sea_per_unit_low?: number | null;
  landed_gbp_sea_per_unit_high?: number | null;
  landed_gbp_sea_total_1000_low?: number | null;
  landed_gbp_sea_total_1000_high?: number | null;
  landed_cad_sea_per_unit_low?: number | null;
  landed_cad_sea_per_unit_high?: number | null;
  landed_cad_sea_total_1000_low?: number | null;
  landed_cad_sea_total_1000_high?: number | null;
};

function formatPerUnitRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string
) {
  const currency = currencyForCode(currencyCode);
  const perUnitDigits = currency.code === "NGN" ? 0 : 2;
  const lowText = formatCurrency(low, currency, perUnitDigits);
  const highText = formatCurrency(high, currency, perUnitDigits);
  const lowNum = low === null || low === undefined ? null : Number(low);
  const highNum = high === null || high === undefined ? null : Number(high);
  if (
    lowText !== "—" &&
    highText !== "—" &&
    Number.isFinite(lowNum) &&
    Number.isFinite(highNum) &&
    lowNum === highNum
  ) {
    return `${lowText} per unit`;
  }
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} per unit`;
  if (lowText !== "—") return `${lowText} per unit`;
  if (highText !== "—") return `${highText} per unit`;
  return "";
}

function formatTotalRange(
  low: number | null | undefined,
  high: number | null | undefined,
  currencyCode: string
) {
  const currency = currencyForCode(currencyCode);
  const lowText = formatCurrency(low, currency);
  const highText = formatCurrency(high, currency);
  const lowNum = low === null || low === undefined ? null : Number(low);
  const highNum = high === null || high === undefined ? null : Number(high);
  if (
    lowText !== "—" &&
    highText !== "—" &&
    Number.isFinite(lowNum) &&
    Number.isFinite(highNum) &&
    lowNum === highNum
  ) {
    return `${lowText} for 1,000 units`;
  }
  if (lowText !== "—" && highText !== "—") return `${lowText}–${highText} for 1,000 units`;
  if (lowText !== "—") return `${lowText} for 1,000 units`;
  if (highText !== "—") return `${highText} for 1,000 units`;
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

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function WhiteLabelCatalogClient({
  items,
  detailBase = "/white-label",
  currencyCode = "NGN",
}: {
  items: ProductItem[];
  detailBase?: string;
  currencyCode?: string;
}) {
  const normalizedBase = detailBase.endsWith("/") ? detailBase.slice(0, -1) : detailBase;
  const currency = currencyForCode(currencyCode);

  const itemLinks = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        detailHref: `${normalizedBase}/${item.slug || slugify(item.product_name)}`,
      })),
    [items, normalizedBase]
  );

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4">
        {itemLinks.length ? (
          itemLinks.map((item) => (
            <div
              key={`${item.id}-${item.product_name}`}
              className="flex h-full flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="relative h-52 w-full border-b border-neutral-100 bg-[#F2F3F5] p-4">
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
                {(() => {
                  const landed = pickLandedFieldsByCurrency(item, currencyCode);
                  const hasPerUnit = landed.perUnitLow != null || landed.perUnitHigh != null;
                  const hasTotal = landed.totalLow != null || landed.totalHigh != null;
                  return (
                    <>
                      <p className="mt-3 text-sm text-neutral-600">
                        {hasPerUnit
                          ? formatPerUnitRange(landed.perUnitLow, landed.perUnitHigh, currencyCode)
                          : "Pricing pending"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {hasTotal
                          ? formatTotalRange(landed.totalLow, landed.totalHigh, currencyCode)
                          : "Pricing pending"}
                      </p>
                    </>
                  );
                })()}
              </div>

              <div className="mt-auto px-5 pb-6">
                <Link
                  href={item.detailHref}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-700"
                >
                  View detail
                </Link>
                {(() => {
                  const landed = pickLandedFieldsByCurrency(item, currencyCode);
                  const perUnitText = formatPerUnitRange(landed.perUnitLow, landed.perUnitHigh, currencyCode);
                  return (
                    <Link
                      href={`/sourcing-project?route_type=white_label&product_id=${encodeURIComponent(String(item.id))}&product_name=${encodeURIComponent(item.product_name)}&product_category=${encodeURIComponent(item.category)}&product_landed_ngn_per_unit=${encodeURIComponent(perUnitText)}`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Start sourcing
                    </Link>
                  );
                })()}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            No ideas matched your search. Try a different keyword or category.
          </div>
        )}
      </div>
    </>
  );
}
