"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AgentAppShell from "../_components/AgentAppShell";

type ShippingRate = {
  id: number;
  shipping_type_id: number;
  rate_value: number;
  rate_unit: "per_kg" | "per_cbm" | string;
  currency: string;
  shipping_type_name?: string | null;
};

type QuoteItem = {
  product_name: string;
  product_description: string;
  quantity: number;
  unit_price_rmb: number;
  unit_weight_kg: number;
  unit_cbm: number;
  local_transport_rmb: number;
};

type QuoteRecord = {
  id: number;
  token: string;
  items_json?: any;
  exchange_rate_rmb?: number;
  exchange_rate_usd?: number;
  shipping_rate_usd?: number;
  shipping_rate_unit?: string;
  shipping_type_id?: number | null;
  markup_percent?: number;
  agent_percent?: number;
  agent_commitment_percent?: number;
  commitment_due_ngn?: number;
  deposit_enabled?: number | boolean;
  deposit_percent?: number;
  payment_purpose?: string;
  currency?: string;
  agent_note?: string | null;
};

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureItems(raw: any): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    product_name: String(item.product_name || "").trim(),
    product_description: String(item.product_description || "").trim(),
    quantity: num(item.quantity, 0),
    unit_price_rmb: num(item.unit_price_rmb, 0),
    unit_weight_kg: num(item.unit_weight_kg, 0),
    unit_cbm: num(item.unit_cbm, 0),
    local_transport_rmb: num(item.local_transport_rmb, 0),
  }));
}

function computeTotals(items: QuoteItem[], exchangeRmb: number, exchangeUsd: number, shippingRateUsd: number, shippingUnit: string, markupPercent: number) {
  let totalProductRmb = 0;
  let totalLocalTransportRmb = 0;
  let totalWeightKg = 0;
  let totalCbm = 0;

  for (const item of items) {
    const qty = num(item.quantity, 0);
    totalProductRmb += qty * num(item.unit_price_rmb, 0);
    totalLocalTransportRmb += num(item.local_transport_rmb, 0);
    totalWeightKg += qty * num(item.unit_weight_kg, 0);
    totalCbm += qty * num(item.unit_cbm, 0);
  }

  const totalProductRmbWithLocal = totalProductRmb + totalLocalTransportRmb;
  const totalProductNgn = totalProductRmbWithLocal * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb: totalProductRmbWithLocal,
    totalProductNgn,
    totalWeightKg,
    totalCbm,
    totalShippingUsd,
    totalShippingNgn,
    totalMarkupNgn,
    totalDueNgn,
  };
}

function QuoteBuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handoffId = Number(searchParams.get("handoff_id") || 0);
  const queryReadOnly = searchParams.get("readonly") === "1";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locked, setLocked] = useState(queryReadOnly);
  const [lockReason, setLockReason] = useState<string | null>(queryReadOnly ? "Delivered projects are read-only." : null);

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);

  const [items, setItems] = useState<QuoteItem[]>([
    {
      product_name: "",
      product_description: "",
      quantity: 1,
      unit_price_rmb: 0,
      unit_weight_kg: 0,
      unit_cbm: 0,
      local_transport_rmb: 0,
    },
  ]);

  const [exchangeRmb, setExchangeRmb] = useState(0);
  const [exchangeUsd, setExchangeUsd] = useState(0);
  const [shippingRateUsd, setShippingRateUsd] = useState(0);
  const [shippingRateUnit, setShippingRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [shippingTypeId, setShippingTypeId] = useState<number | null>(null);
  const [shippingRateId, setShippingRateId] = useState<number | null>(null);
  const [markupPercent, setMarkupPercent] = useState(0);
  const [agentPercent, setAgentPercent] = useState(0);
  const [agentCommitmentPercent, setAgentCommitmentPercent] = useState(0);
  const [commitmentDueNgn, setCommitmentDueNgn] = useState(0);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositPercent, setDepositPercent] = useState(0);
  const [agentNote, setAgentNote] = useState("");
  const [paymentPurpose, setPaymentPurpose] = useState("full_product_payment");
  const [latestQuoteToken, setLatestQuoteToken] = useState<string | null>(null);
  const [latestQuoteId, setLatestQuoteId] = useState<number | null>(null);

  const totals = useMemo(() => {
    return computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent);
  }, [items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent]);

  const selectedRate = useMemo(() => {
    if (!shippingRates.length) return null;
    return shippingRates.find((rate) => rate.id === shippingRateId) || shippingRates[0] || null;
  }, [shippingRates, shippingRateId]);

  const isReadOnly = queryReadOnly || locked;

  const canSubmit = useMemo(() => {
    if (isReadOnly) return false;
    if (!handoffId) return false;
    if (!items.length) return false;
    if (items.some((i) => !i.product_name || i.quantity <= 0)) return false;
    if (exchangeRmb <= 0 || exchangeUsd <= 0 || shippingRateUsd <= 0) return false;
    return true;
  }, [handoffId, items, exchangeRmb, exchangeUsd, shippingRateUsd, isReadOnly]);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/internal/quotes/config", { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;

    setShippingRates(Array.isArray(json.shipping_rates) ? json.shipping_rates : []);

    if (json.settings) {
      setMarkupPercent(num(json.settings.markup_percent, 0));
      setAgentPercent(num(json.settings.agent_percent, 0));
      setAgentCommitmentPercent(num(json.settings.agent_commitment_percent, 0));
      setCommitmentDueNgn(num(json.settings.commitment_due_ngn, 0));
      setExchangeRmb(num(json.settings.exchange_rate_rmb, 0));
      setExchangeUsd(num(json.settings.exchange_rate_usd, 0));
    }
  }, []);

  const loadLatestQuote = useCallback(async () => {
    if (!handoffId) return;
    const res = await fetch(`/api/internal/quotes?handoff_id=${handoffId}`, { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;
    const itemsList = Array.isArray(json.items) ? json.items : [];
    const latest = itemsList.length ? (itemsList[0] as QuoteRecord) : null;
    if (!latest) return;

    setItems(ensureItems(latest.items_json));
    setExchangeRmb(num(latest.exchange_rate_rmb, exchangeRmb));
    setExchangeUsd(num(latest.exchange_rate_usd, exchangeUsd));
    setShippingRateUsd(num(latest.shipping_rate_usd, shippingRateUsd));
    if (latest.shipping_rate_unit === "per_cbm") setShippingRateUnit("per_cbm");
    setShippingTypeId(latest.shipping_type_id ?? null);
    setMarkupPercent(num(latest.markup_percent, markupPercent));
    setAgentPercent(num(latest.agent_percent, agentPercent));
    setAgentCommitmentPercent(num(latest.agent_commitment_percent, agentCommitmentPercent));
    setCommitmentDueNgn(num(latest.commitment_due_ngn, commitmentDueNgn));
    setDepositEnabled(!!latest.deposit_enabled);
    setDepositPercent(num(latest.deposit_percent, depositPercent));
    if (latest.payment_purpose) setPaymentPurpose(String(latest.payment_purpose));
    setAgentNote(String(latest.agent_note || ""));
    setLatestQuoteToken(latest.token || null);
    setLatestQuoteId(latest.id || null);
  }, [handoffId, exchangeRmb, exchangeUsd, shippingRateUsd, markupPercent, agentPercent, agentCommitmentPercent, commitmentDueNgn, depositPercent]);

  const loadHandoffStatus = useCallback(async () => {
    if (!handoffId) return;
    const res = await fetch(`/api/internal/handoffs/${handoffId}`, { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;
    const status = String(json?.item?.status || "").toLowerCase();
    if (status === "delivered") {
      setLocked(true);
      setLockReason("Delivered projects are read-only.");
    }
  }, [handoffId]);

  useEffect(() => {
    async function boot() {
      setLoading(true);
      setError(null);
      await loadConfig();
      await loadHandoffStatus();
      await loadLatestQuote();
      setLoading(false);
    }
    boot();
  }, [loadConfig, loadLatestQuote, loadHandoffStatus]);

  useEffect(() => {
    if (!shippingRates.length) return;
    if (!shippingRateId) {
      setShippingRateId(shippingRates[0].id);
      return;
    }
    const rate = shippingRates.find((r) => r.id === shippingRateId);
    if (!rate) return;
    setShippingRateUsd(num(rate.rate_value, 0));
    setShippingRateUnit(rate.rate_unit === "per_cbm" ? "per_cbm" : "per_kg");
    setShippingTypeId(rate.shipping_type_id);
  }, [shippingRateId, shippingRates]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_name: "",
        product_description: "",
        quantity: 1,
        unit_price_rmb: 0,
        unit_weight_kg: 0,
        unit_cbm: 0,
        local_transport_rmb: 0,
      },
    ]);
  };

  const updateItem = (idx: number, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i != idx));
  };

  const handleSubmit = async () => {
    if (isReadOnly) return;
    if (!handoffId) {
      setError("handoff_id is required to create a quote.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        handoff_id: handoffId,
        items,
        exchange_rate_rmb: exchangeRmb,
        exchange_rate_usd: exchangeUsd,
        shipping_rate_usd: shippingRateUsd,
        shipping_rate_unit: shippingRateUnit,
        shipping_type_id: shippingTypeId,
        markup_percent: markupPercent,
        agent_percent: agentPercent,
        agent_commitment_percent: agentCommitmentPercent,
        commitment_due_ngn: commitmentDueNgn,
        deposit_enabled: depositEnabled,
        deposit_percent: depositEnabled ? depositPercent : 0,
        payment_purpose: paymentPurpose,
        currency: "NGN",
        agent_note: agentNote,
      };
      const res = await fetch(
        latestQuoteId ? `/api/internal/quotes/${latestQuoteId}` : "/api/internal/quotes",
        {
          method: latestQuoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      if (latestQuoteId) {
        setSuccess(`Quote #${latestQuoteId} saved.`);
      } else {
        setSuccess(`Quote #${json.id} created.`);
      }
      if (json?.token) {
        setLatestQuoteToken(json.token);
        setLatestQuoteId(json.id);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to create quote.");
    } finally {
      setSaving(false);
    }
  };

  if (!handoffId) {
    return (
      <AgentAppShell title="Quote builder" subtitle="Create a quote for a specific handoff.">
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-neutral-600">Enter a handoff id to begin.</p>
          <button
            type="button"
            onClick={() => router.push("/agent-app/projects")}
            className="mt-4 rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
          >
            Browse projects
          </button>
        </div>
      </AgentAppShell>
    );
  }

  return (
    <AgentAppShell title="Quote builder" subtitle={`Drafting quote for handoff #${handoffId}.`}>
      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading quote builder…
        </div>
      ) : (
        <div className="grid gap-6">
          {latestQuoteToken ? (
            <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Latest quote</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Quote #{latestQuoteId} is available for this handoff.
                  </p>
                </div>
                <span className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461]">
                  Quote ready
                </span>
              </div>
            </section>
          ) : null}
          {isReadOnly ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              {lockReason || "This quote is read-only."}
            </section>
          ) : null}
          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Quote items</p>
                <p className="mt-1 text-sm text-neutral-500">Add products, quantities, and weights.</p>
              </div>
              <button
                type="button"
                onClick={addItem}
                disabled={isReadOnly}
                className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
              >
                Add item
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-neutral-900">Item {idx + 1}</p>
                    {items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={isReadOnly}
                        className="text-xs font-semibold text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Product name</label>
                      <input
                        value={item.product_name}
                        onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Quantity</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit price (RMB)</label>
                      <input
                        type="number"
                        value={item.unit_price_rmb}
                        onChange={(e) => updateItem(idx, { unit_price_rmb: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit weight (kg)</label>
                      <input
                        type="number"
                        value={item.unit_weight_kg}
                        onChange={(e) => updateItem(idx, { unit_weight_kg: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit CBM</label>
                      <input
                        type="number"
                        value={item.unit_cbm}
                        onChange={(e) => updateItem(idx, { unit_cbm: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Local transport (RMB)</label>
                      <input
                        type="number"
                        value={item.local_transport_rmb}
                        onChange={(e) => updateItem(idx, { local_transport_rmb: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Description</label>
                    <textarea
                      value={item.product_description}
                      onChange={(e) => updateItem(idx, { product_description: e.target.value })}
                      readOnly={isReadOnly}
                      disabled={isReadOnly}
                      className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Shipping</p>
              <p className="mt-2 text-xs text-neutral-500">
                Using admin rates. Select a shipping type to update the estimate.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {shippingRates.map((rate) => {
                  const selected = rate.id === (shippingRateId || selectedRate?.id);
                  const unitLabel = rate.rate_unit === "per_cbm" ? "CBM" : "KG";
                  return (
                    <button
                      key={rate.id}
                      type="button"
                      onClick={() => setShippingRateId(rate.id)}
                      disabled={isReadOnly}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        selected
                          ? "bg-[#2D3461] text-white"
                          : "border border-[rgba(45,52,97,0.2)] text-[#2D3461]"
                      } ${isReadOnly ? "opacity-60" : ""}`}
                    >
                      {rate.shipping_type_name || "Shipping"} · {rate.rate_value}/{unitLabel}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Selected</p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">
                  {selectedRate
                    ? `${selectedRate.shipping_type_name || "Shipping"} · ${selectedRate.rate_value}/${
                        selectedRate.rate_unit === "per_cbm" ? "CBM" : "KG"
                      }`
                    : "Select a shipping type"}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
                  <div>Shipping (NGN): {totals.totalShippingNgn.toLocaleString()}</div>
                  <div>Shipping (USD): {totals.totalShippingUsd.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Quote summary</p>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                <div className="flex items-center justify-between">
                  <span>Product total (RMB)</span>
                  <span className="font-semibold text-neutral-900">{totals.totalProductRmb.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total weight (KG)</span>
                  <span className="font-semibold text-neutral-900">{totals.totalWeightKg.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total CBM</span>
                  <span className="font-semibold text-neutral-900">{totals.totalCbm.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[rgba(45,52,97,0.14)] pt-3">
                  <span>Estimated landing cost (NGN)</span>
                  <span className="text-lg font-semibold text-[#2D3461]">{totals.totalDueNgn.toLocaleString()}</span>
                </div>
                <div className="text-xs text-neutral-500">
                  USD:{" "}
                  {exchangeUsd > 0 ? (totals.totalDueNgn / exchangeUsd).toFixed(2) : "0.00"}
                </div>
                <div className="grid gap-3 pt-3">
                  {error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                      {error}
                    </div>
                  ) : null}
                  {success ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                      {success}
                    </div>
                  ) : null}
                  {isReadOnly ? (
                    <div className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-center text-xs font-semibold text-neutral-500">
                      Quote is locked
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit || saving}
                      className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
                    >
                      {saving ? "Saving…" : latestQuoteId ? "Save quote" : "Create quote"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Payment purpose</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { value: "commitment_fee", label: "Commitment fee" },
                  { value: "deposit", label: "Deposit" },
                  { value: "product_balance", label: "Product balance" },
                  { value: "full_product_payment", label: "Full product payment" },
                  { value: "shipping_payment", label: "Shipping payment" },
                  { value: "additional_payment", label: "Additional payment" },
                ].map((opt) => {
                  const selected = paymentPurpose === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentPurpose(opt.value)}
                      disabled={isReadOnly}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        selected
                          ? "bg-[#2D3461] text-white"
                          : "border border-[rgba(45,52,97,0.2)] text-[#2D3461]"
                      } ${isReadOnly ? "opacity-60" : ""}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4 text-sm text-neutral-600">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-neutral-900">Enable deposit</p>
                    <p className="text-xs text-neutral-500">Allow customer to pay a deposit first.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepositEnabled((v) => !v)}
                    disabled={isReadOnly}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      depositEnabled ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
                    } ${isReadOnly ? "opacity-60" : ""}`}
                  >
                    {depositEnabled ? "On" : "Off"}
                  </button>
                </div>
                {depositEnabled ? (
                  <div className="mt-3">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Deposit percent</label>
                    <input
                      type="number"
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(num(e.target.value, 0))}
                      readOnly={isReadOnly}
                      disabled={isReadOnly}
                      className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Agent note</p>
              <p className="mt-1 text-sm text-neutral-500">Add a short explanation for the customer and admin.</p>
              <textarea
                value={agentNote}
                onChange={(e) => setAgentNote(e.target.value)}
                readOnly={isReadOnly}
                disabled={isReadOnly}
                className="mt-3 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                rows={4}
              />
            </div>
          </section>
        </div>
      )}
    </AgentAppShell>
  );
}

export default function QuoteBuilderPage() {
  return (
    <Suspense
      fallback={
        <AgentAppShell title="Quote builder" subtitle="Loading quote builder…">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            Loading quote builder…
          </div>
        </AgentAppShell>
      }
    >
      <QuoteBuilderInner />
    </Suspense>
  );
}
