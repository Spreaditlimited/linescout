"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

type QuoteItem = {
  product_name: string;
  quantity: number;
  unit_price_rmb: number;
  unit_weight_kg: number;
  unit_cbm: number;
};

type QuoteRow = {
  id: number;
  token: string;
  items_json: string;
  payment_purpose?: string | null;
  exchange_rate_rmb: number;
  exchange_rate_usd: number;
  shipping_type_id?: number | null;
  shipping_rate_usd: number;
  shipping_rate_unit: "per_kg" | "per_cbm";
  markup_percent: number;
  agent_percent: number;
  agent_commitment_percent: number;
  commitment_due_ngn: number;
};

type ShippingRate = {
  id: number;
  shipping_type_id: number;
  shipping_type_name: string;
  rate_value: number;
  rate_unit: "per_kg" | "per_cbm";
  currency: string;
};

type Settings = {
  exchange_rate_rmb: number;
  exchange_rate_usd: number;
  markup_percent: number;
  agent_percent: number;
  agent_commitment_percent: number;
  commitment_due_ngn: number;
};

const purposeOptions = [
  { value: "commitment_fee", label: "Commitment fee" },
  { value: "deposit", label: "Deposit" },
  { value: "product_balance", label: "Product balance" },
  { value: "full_product_payment", label: "Full product payment" },
  { value: "shipping_payment", label: "Shipping payment" },
  { value: "additional_payment", label: "Additional payment" },
];

export default function QuoteEditPage() {
  const params = useParams<{ id: string }>();
  const quoteId = Number(params?.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [items, setItems] = useState<QuoteItem[]>([]);
  const [exchangeRmb, setExchangeRmb] = useState("0");
  const [exchangeUsd, setExchangeUsd] = useState("0");
  const [shippingRateUsd, setShippingRateUsd] = useState("0");
  const [shippingRateUnit, setShippingRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [shippingTypeId, setShippingTypeId] = useState<number | null>(null);
  const [markupPercent, setMarkupPercent] = useState("20");
  const [agentPercent, setAgentPercent] = useState("5");
  const [agentCommitPercent, setAgentCommitPercent] = useState("40");
  const [commitmentDue, setCommitmentDue] = useState("0");
  const [paymentPurpose, setPaymentPurpose] = useState("full_product_payment");

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [quoteRes, configRes] = await Promise.all([
          fetch(`/api/internal/quotes/${quoteId}`, { cache: "no-store" }),
          fetch("/api/internal/quotes/config", { cache: "no-store" }),
        ]);
        const quoteData = await quoteRes.json().catch(() => null);
        const configData = await configRes.json().catch(() => null);
        if (!quoteRes.ok || !quoteData?.ok) throw new Error(quoteData?.error || "Failed to load quote");
        if (!configRes.ok || !configData?.ok) throw new Error(configData?.error || "Failed to load config");

        const q = quoteData.item as QuoteRow;
        const settings = configData.settings as Settings;
        const rates = Array.isArray(configData.shipping_rates) ? (configData.shipping_rates as ShippingRate[]) : [];

        setShippingRates(rates);
        try {
          const parsed = JSON.parse(q.items_json || "[]");
          setItems(Array.isArray(parsed) ? parsed : []);
        } catch {
          setItems([]);
        }

        setExchangeRmb(String(q.exchange_rate_rmb ?? settings.exchange_rate_rmb ?? 0));
        setExchangeUsd(String(q.exchange_rate_usd ?? settings.exchange_rate_usd ?? 0));
        setShippingRateUsd(String(q.shipping_rate_usd ?? 0));
        setShippingRateUnit(q.shipping_rate_unit || "per_kg");
        setShippingTypeId(q.shipping_type_id ?? null);
        setMarkupPercent(String(q.markup_percent ?? settings.markup_percent ?? 0));
        setAgentPercent(String(q.agent_percent ?? settings.agent_percent ?? 0));
        setAgentCommitPercent(String(q.agent_commitment_percent ?? settings.agent_commitment_percent ?? 0));
        setCommitmentDue(String(q.commitment_due_ngn ?? settings.commitment_due_ngn ?? 0));
        setPaymentPurpose(String(q.payment_purpose || "full_product_payment"));
      } catch (e: any) {
        setErr(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    if (quoteId) load();
  }, [quoteId]);

  const totals = useMemo(() => {
    let totalProductRmb = 0;
    let totalWeight = 0;
    let totalCbm = 0;

    items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      totalProductRmb += qty * Number(item.unit_price_rmb || 0);
      totalWeight += qty * Number(item.unit_weight_kg || 0);
      totalCbm += qty * Number(item.unit_cbm || 0);
    });

    const exRmb = Number(exchangeRmb || 0);
    const exUsd = Number(exchangeUsd || 0);
    const shipRate = Number(shippingRateUsd || 0);
    const shipUnits = shippingRateUnit === "per_cbm" ? totalCbm : totalWeight;
    const productNgn = totalProductRmb * exRmb;
    const shippingUsd = shipUnits * shipRate;
    const shippingNgn = shippingUsd * exUsd;
    const markup = (productNgn * Number(markupPercent || 0)) / 100;

    return {
      totalProductRmb,
      totalWeight,
      totalCbm,
      productNgn,
      shippingUsd,
      shippingNgn,
      markup,
      totalDue: productNgn + shippingNgn + markup,
    };
  }, [items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/internal/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          exchange_rate_rmb: Number(exchangeRmb),
          exchange_rate_usd: Number(exchangeUsd),
          shipping_rate_usd: Number(shippingRateUsd),
          shipping_rate_unit: shippingRateUnit,
          shipping_type_id: shippingTypeId,
          markup_percent: Number(markupPercent),
          agent_percent: Number(agentPercent),
          agent_commitment_percent: Number(agentCommitPercent),
          commitment_due_ngn: Number(commitmentDue),
          payment_purpose: paymentPurpose,
          currency: "NGN",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save quote");
      setMsg("Quote saved.");
    } catch (e: any) {
      setErr(e?.message || "Failed to save quote");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { product_name: "", quantity: 1, unit_price_rmb: 0, unit_weight_kg: 0, unit_cbm: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const selectRate = (rateId: number) => {
    const rate = shippingRates.find((r) => r.id === rateId);
    if (!rate) return;
    setShippingRateUsd(String(rate.rate_value));
    setShippingRateUnit(rate.rate_unit);
    setShippingTypeId(rate.shipping_type_id);
  };

  if (loading) return <p className="text-sm text-neutral-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Edit quote</h2>
            <p className="text-xs text-neutral-500">Quote ID #{quoteId}</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save quote"}
          </button>
        </div>
        {err ? (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        ) : null}
        {msg ? (
          <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            {msg}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-neutral-100">Items</div>
        <div className="mt-3 space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <input
                value={item.product_name}
                onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Product name"
              />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="Qty"
                />
                <input
                  value={item.unit_price_rmb}
                  onChange={(e) => updateItem(idx, { unit_price_rmb: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="Unit RMB"
                />
                <input
                  value={item.unit_weight_kg}
                  onChange={(e) => updateItem(idx, { unit_weight_kg: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="Unit KG"
                />
                <input
                  value={item.unit_cbm}
                  onChange={(e) => updateItem(idx, { unit_cbm: Number(e.target.value || 0) })}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="Unit CBM"
                />
              </div>
              {items.length > 1 ? (
                <button
                  onClick={() => removeItem(idx)}
                  className="mt-2 text-xs text-red-300 hover:text-red-200"
                >
                  Remove item
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          onClick={addItem}
          className="mt-3 inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
        >
          Add item
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-neutral-100">Rates & settings</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={exchangeRmb} onChange={(e) => setExchangeRmb(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="RMB → NGN" />
          <input value={exchangeUsd} onChange={(e) => setExchangeUsd(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="USD → NGN" />
          <input value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="Markup %" />
          <input value={agentPercent} onChange={(e) => setAgentPercent(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="Agent % (products)" />
          <input value={agentCommitPercent} onChange={(e) => setAgentCommitPercent(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="Agent % (commitment)" />
          <input value={commitmentDue} onChange={(e) => setCommitmentDue(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="Commitment fee (NGN)" />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-neutral-100">Shipping</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {shippingRates.map((rate) => (
            <button
              key={rate.id}
              onClick={() => selectRate(rate.id)}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
            >
              {rate.shipping_type_name} · {fmtUsd(Number(rate.rate_value || 0))} / {rate.rate_unit}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={shippingRateUsd} onChange={(e) => setShippingRateUsd(e.target.value)} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="Shipping rate USD" />
          <input value={shippingRateUnit} onChange={(e) => setShippingRateUnit(e.target.value === "per_cbm" ? "per_cbm" : "per_kg")} className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600" placeholder="per_kg or per_cbm" />
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          NGN equivalent: {fmtNaira(totals.shippingNgn)}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-neutral-100">Payment purpose</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {purposeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPaymentPurpose(opt.value)}
              className={`rounded-lg border px-3 py-2 text-xs ${paymentPurpose === opt.value ? "border-white bg-white text-neutral-900" : "border-neutral-800 bg-neutral-950 text-neutral-200"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-neutral-100">Summary</div>
        <div className="mt-2 text-xs text-neutral-400">
          Product total (RMB): {totals.totalProductRmb.toFixed(2)}
        </div>
        <div className="text-xs text-neutral-400">Weight (KG): {totals.totalWeight.toFixed(2)}</div>
        <div className="text-xs text-neutral-400">CBM: {totals.totalCbm.toFixed(2)}</div>
        <div className="mt-2 text-sm font-semibold text-emerald-200">Total due: {fmtNaira(totals.totalDue)}</div>
      </div>
    </div>
  );
}
