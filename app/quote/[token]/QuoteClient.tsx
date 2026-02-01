"use client";

import { useMemo, useState } from "react";

type ShippingRate = {
  id: number;
  shipping_type_id: number;
  shipping_type_name: string;
  rate_value: number;
  rate_unit: "per_kg" | "per_cbm";
  currency?: string | null;
};

type QuoteClientProps = {
  token: string;
  customerName?: string | null;
  items: any[];
  exchangeRmb: number;
  exchangeUsd: number;
  markupPercent: number;
  shippingRates: ShippingRate[];
  defaultShippingTypeId?: number | null;
};

function fmtNaira(value: number) {
  if (!Number.isFinite(value)) return "NGN 0";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `NGN ${Math.round(value).toLocaleString()}`;
  }
}

function fmtUsd(value: number) {
  if (!Number.isFinite(value)) return "$0";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function computeTotals(
  items: any[],
  exchangeRmb: number,
  exchangeUsd: number,
  shippingRateUsd: number,
  shippingUnit: "per_kg" | "per_cbm",
  markupPercent: number
) {
  let totalProductRmb = 0;
  let totalLocalTransportRmb = 0;
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price_rmb || 0);
    const unitWeight = Number(item.unit_weight_kg || 0);
    const unitCbm = Number(item.unit_cbm || 0);
    const localTransport = Number(item.local_transport_rmb || 0);

    totalProductRmb += qty * unitPrice;
    totalLocalTransportRmb += localTransport;
    totalWeightKg += qty * unitWeight;
    totalCbm += qty * unitCbm;
  }

  const totalProductNgn = (totalProductRmb + totalLocalTransportRmb) * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb,
    totalProductNgn,
    totalWeightKg,
    totalCbm,
    totalShippingUsd,
    totalShippingNgn,
    totalMarkupNgn,
    totalDueNgn,
  };
}

export default function QuoteClient({
  token,
  customerName,
  items,
  exchangeRmb,
  exchangeUsd,
  markupPercent,
  shippingRates,
  defaultShippingTypeId,
}: QuoteClientProps) {
  const initialRateId = useMemo(() => {
    if (!shippingRates.length) return null;
    if (defaultShippingTypeId) {
      const match = shippingRates.find((rate) => rate.shipping_type_id === defaultShippingTypeId);
      if (match) return match.id;
    }
    return shippingRates[0].id;
  }, [shippingRates, defaultShippingTypeId]);

  const [selectedRateId, setSelectedRateId] = useState<number | null>(initialRateId);

  const selectedRate = useMemo(() => {
    if (!shippingRates.length) return null;
    return shippingRates.find((rate) => rate.id === selectedRateId) || shippingRates[0];
  }, [shippingRates, selectedRateId]);

  const totals = useMemo(() => {
    const rateUsd = Number(selectedRate?.rate_value || 0);
    const unit = (selectedRate?.rate_unit || "per_kg") as "per_kg" | "per_cbm";
    return computeTotals(items, exchangeRmb, exchangeUsd, rateUsd, unit, markupPercent);
  }, [items, exchangeRmb, exchangeUsd, markupPercent, selectedRate]);

  const unitLabel = selectedRate?.rate_unit === "per_cbm" ? "CBM" : "KG";
  const [payOption, setPayOption] = useState<"product_only" | "product_plus_shipping">("product_plus_shipping");
  const productOnlyDue = totals.totalProductNgn + totals.totalMarkupNgn;
  const productTotalDisplay = totals.totalProductNgn + totals.totalMarkupNgn;
  const totalDueNgn = payOption === "product_only" ? productOnlyDue : totals.totalDueNgn;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Quote</h1>
              <p className="mt-1 text-sm text-neutral-400">
                Customer: <span className="text-neutral-200">{customerName || "Customer"}</span>
              </p>
              <p className="text-xs text-neutral-500">Token: {token}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-400">Total due</div>
              <div className="text-2xl font-semibold text-emerald-200">{fmtNaira(totalDueNgn)}</div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Qty</th>
                  <th className="px-4 py-3 text-left">Unit RMB</th>
                  <th className="px-4 py-3 text-left">Total RMB</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr key={`${idx}`} className="border-t border-neutral-800">
                    <td className="px-4 py-3 text-neutral-200">{item.product_name}</td>
                    <td className="px-4 py-3 text-neutral-400">{item.quantity}</td>
                    <td className="px-4 py-3 text-neutral-400">{item.unit_price_rmb}</td>
                    <td className="px-4 py-3 text-neutral-200">
                      {Number(item.quantity || 0) * Number(item.unit_price_rmb || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Shipping type</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {shippingRates.map((rate) => {
                const selected = rate.id === selectedRate?.id;
                const rateUnit = rate.rate_unit === "per_cbm" ? "CBM" : "KG";
                return (
                  <button
                    key={rate.id}
                    type="button"
                    onClick={() => setSelectedRateId(rate.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      selected
                        ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                        : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                    }`}
                  >
                    {rate.shipping_type_name} · {fmtUsd(Number(rate.rate_value || 0))} / {rateUnit}
                  </button>
                );
              })}
            </div>
            {selectedRate ? (
              <p className="mt-3 text-xs text-neutral-500">
                Selected: {selectedRate.shipping_type_name} · {fmtUsd(Number(selectedRate.rate_value || 0))} / {unitLabel}
              </p>
            ) : null}
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Payment option</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPayOption("product_only")}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  payOption === "product_only"
                    ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                Pay product only
              </button>
              <button
                type="button"
                onClick={() => setPayOption("product_plus_shipping")}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  payOption === "product_plus_shipping"
                    ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                Pay product + shipping
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Product only includes product cost + local transport. Shipping can be paid later.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Product total (NGN)</div>
              <div className="text-lg font-semibold">{fmtNaira(productTotalDisplay)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Shipping (USD)</div>
              <div className="text-lg font-semibold">{fmtUsd(totals.totalShippingUsd)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Shipping (NGN)</div>
              <div className="text-lg font-semibold">{fmtNaira(totals.totalShippingNgn)}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Total due (NGN)</div>
            <div className="text-xl font-semibold text-emerald-200">{fmtNaira(totalDueNgn)}</div>
            <p className="mt-2 text-xs text-neutral-500">
              Amounts are recalculated using current rates and settings. Payment link will be attached here once enabled.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
