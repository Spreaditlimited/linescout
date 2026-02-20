"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AgentAppShell from "../_components/AgentAppShell";
import PremiumSelect from "../_components/PremiumSelect";
import ConfirmModal from "@/components/ConfirmModal";

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
  unit_price_rmb: number | string;
  unit_weight_kg: number | string;
  unit_cbm: number | string;
  local_transport_rmb: number | string;
};

type QuoteRecord = {
  id: number;
  handoff_id?: number | null;
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
  created_at?: string | null;
};

type ProjectItem = {
  conversation_id: number;
  handoff_id: number | null;
  customer_name?: string | null;
  route_type?: string | null;
  handoff_status?: string | null;
  assigned_agent_id?: number | null;
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
  const queryHandoffId = Number(searchParams.get("handoff_id") || 0);
  const queryConversationId = Number(searchParams.get("conversation_id") || 0);
  const queryReadOnly = searchParams.get("readonly") === "1";

  const [activeHandoffId, setActiveHandoffId] = useState<number | null>(
    queryHandoffId > 0 ? queryHandoffId : null
  );
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    queryConversationId > 0 ? queryConversationId : null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(queryReadOnly);
  const [lockReason, setLockReason] = useState<string | null>(queryReadOnly ? "Delivered projects are read-only." : null);
  const [approvedToClaim, setApprovedToClaim] = useState(true);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);
  const [showAllQuotes, setShowAllQuotes] = useState(false);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const suppressAutoSelectRef = useRef(false);
  const viewingSavedQuoteRef = useRef(false);
  const draftRef = useRef<{
    activeHandoffId: number | null;
    activeConversationId: number | null;
    items: QuoteItem[];
    exchangeRmb: number;
    exchangeUsd: number;
    shippingRateUsd: number;
    shippingRateUnit: "per_kg" | "per_cbm";
    shippingTypeId: number | null;
    shippingRateId: number | null;
    markupPercent: number;
    agentPercent: number;
    agentCommitmentPercent: number;
    commitmentDueNgn: number;
    depositEnabled: boolean;
    depositPercent: number;
    agentNote: string;
    paymentPurpose: string;
    latestQuoteToken: string | null;
    latestQuoteId: number | null;
  } | null>(null);
  const restoreDraftRef = useRef(false);

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);

  const [items, setItems] = useState<QuoteItem[]>([
    {
      product_name: "",
      product_description: "",
      quantity: 1,
      unit_price_rmb: "",
      unit_weight_kg: "",
      unit_cbm: "",
      local_transport_rmb: "",
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
  const [defaultSettings, setDefaultSettings] = useState({
    exchangeRmb: 0,
    exchangeUsd: 0,
    markupPercent: 0,
    agentPercent: 0,
    agentCommitmentPercent: 0,
    commitmentDueNgn: 0,
  });

  const totals = useMemo(() => {
    return computeTotals(items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent);
  }, [items, exchangeRmb, exchangeUsd, shippingRateUsd, shippingRateUnit, markupPercent]);

  const publicLink = useMemo(() => {
    if (!latestQuoteToken) return "";
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/quote/${latestQuoteToken}`;
    }
    const base =
      (process.env.NEXT_PUBLIC_APP_URL || "https://linescout.sureimports.com").replace(/\/$/, "");
    return `${base}/quote/${latestQuoteToken}`;
  }, [latestQuoteToken]);

  const selectedRate = useMemo(() => {
    if (!shippingRates.length) return null;
    return shippingRates.find((rate) => rate.id === shippingRateId) || shippingRates[0] || null;
  }, [shippingRates, shippingRateId]);

  const isReadOnly = queryReadOnly || locked;

  const canSubmit = useMemo(() => {
    if (isReadOnly) return false;
    if (!activeHandoffId) return false;
    if (!["manufacturer_found", "paid", "shipped", "delivered"].includes(String(handoffStatus || "").toLowerCase())) {
      return false;
    }
    if (!approvedToClaim) return false;
    if (!items.length) return false;
    if (items.some((i) => !i.product_name || i.quantity <= 0)) return false;
    if (exchangeRmb <= 0 || exchangeUsd <= 0 || shippingRateUsd <= 0) return false;
    return true;
  }, [activeHandoffId, approvedToClaim, items, exchangeRmb, exchangeUsd, shippingRateUsd, isReadOnly, handoffStatus]);

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
      setDefaultSettings({
        exchangeRmb: num(json.settings.exchange_rate_rmb, 0),
        exchangeUsd: num(json.settings.exchange_rate_usd, 0),
        markupPercent: num(json.settings.markup_percent, 0),
        agentPercent: num(json.settings.agent_percent, 0),
        agentCommitmentPercent: num(json.settings.agent_commitment_percent, 0),
        commitmentDueNgn: num(json.settings.commitment_due_ngn, 0),
      });
    }
  }, [error]);

  const loadApproval = useCallback(async () => {
    try {
      const res = await fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const approved = !!json?.checklist?.approved_to_claim;
      setApprovedToClaim(approved);
      if (!approved) {
        setError("You need to be approved to use this feature.");
      } else if (error === "You need to be approved to use this feature.") {
        setError(null);
      }
    } catch {
      // ignore
    }
  }, []);

  const selectQuote = useCallback((quote: QuoteRecord) => {
    if (!quote) return;
    if (quote.handoff_id && quote.handoff_id !== activeHandoffId) {
      setActiveHandoffId(Number(quote.handoff_id));
    }
    setItems(ensureItems(quote.items_json));
    setExchangeRmb((prev) => num(quote.exchange_rate_rmb, prev));
    setExchangeUsd((prev) => num(quote.exchange_rate_usd, prev));
    setShippingRateUsd((prev) => num(quote.shipping_rate_usd, prev));
    if (quote.shipping_rate_unit === "per_cbm") setShippingRateUnit("per_cbm");
    setShippingTypeId(quote.shipping_type_id ?? null);
    setMarkupPercent((prev) => num(quote.markup_percent, prev));
    setAgentPercent((prev) => num(quote.agent_percent, prev));
    setAgentCommitmentPercent((prev) => num(quote.agent_commitment_percent, prev));
    setCommitmentDueNgn((prev) => num(quote.commitment_due_ngn, prev));
    setDepositEnabled(!!quote.deposit_enabled);
    setDepositPercent((prev) => num(quote.deposit_percent, prev));
    if (quote.payment_purpose) setPaymentPurpose(String(quote.payment_purpose));
    setAgentNote(String(quote.agent_note || ""));
    setLatestQuoteToken(quote.token || null);
    setLatestQuoteId(quote.id || null);
    viewingSavedQuoteRef.current = true;
  }, [activeHandoffId, queryReadOnly]);

  const loadQuotes = useCallback(async (hid?: number, scope?: "mine") => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const url =
        scope === "mine"
          ? "/api/internal/quotes?scope=mine"
          : `/api/internal/quotes?handoff_id=${hid}`;
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setQuotesError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      const list = Array.isArray(json.items) ? (json.items as QuoteRecord[]) : [];
      setQuotes(list);
      if (!suppressAutoSelectRef.current && !restoreDraftRef.current && latestQuoteId) {
        const current = list.find((q) => q.id === latestQuoteId);
        if (current) {
          selectQuote(current);
        }
      }
    } catch (e: any) {
      setQuotesError(e?.message || "Failed to load quotes");
    } finally {
      if (suppressAutoSelectRef.current) {
        suppressAutoSelectRef.current = false;
      }
      setQuotesLoading(false);
    }
  }, [latestQuoteId, selectQuote]);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch(
        "/api/internal/paid-chat/inbox?limit=80&cursor=0&kind=paid&scope=mine",
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const list = Array.isArray(json.items) ? json.items : [];
      const allowed = list.filter((item: ProjectItem) =>
        ["manufacturer_found", "paid", "shipped", "delivered"].includes(
          String(item.handoff_status || "").toLowerCase()
        )
      );
      setProjects(allowed);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadHandoffStatus = useCallback(async () => {
    if (!activeHandoffId) return;
    const res = await fetch(`/api/internal/handoffs/${activeHandoffId}`, { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;
    const status = String(json?.item?.status || "").toLowerCase();
    setHandoffStatus(status || null);
    if (status === "delivered") {
      setLocked(true);
      setLockReason("Delivered projects are read-only.");
    } else if (!queryReadOnly) {
      setLocked(false);
      setLockReason(null);
    }
  }, [activeHandoffId]);

  useEffect(() => {
    if (queryHandoffId && queryHandoffId !== activeHandoffId) {
      setActiveHandoffId(queryHandoffId);
    }
    if (queryConversationId && queryConversationId !== activeConversationId) {
      setActiveConversationId(queryConversationId);
    }
    if (!queryHandoffId) {
      setShowAllQuotes(true);
    }
  }, [queryHandoffId, queryConversationId]);

  useEffect(() => {
    async function boot() {
      setLoading(true);
      setError(null);
      await loadApproval();
      await loadConfig();
      setLoading(false);
    }
    boot();
  }, [loadApproval, loadConfig]);

  useEffect(() => {
    if (activeHandoffId) {
      loadHandoffStatus();
    }
  }, [activeHandoffId, loadHandoffStatus]);

  useEffect(() => {
    if (showAllQuotes) {
      loadQuotes(undefined, "mine");
    } else if (activeHandoffId) {
      loadQuotes(activeHandoffId);
    }
  }, [activeHandoffId, loadQuotes, showAllQuotes]);

  useEffect(() => {
    if (!restoreDraftRef.current || showAllQuotes) return;
    const draft = draftRef.current;
    if (!draft) return;
    if (draft.activeHandoffId && draft.activeHandoffId !== activeHandoffId) {
      setActiveHandoffId(draft.activeHandoffId);
      setActiveConversationId(draft.activeConversationId ?? null);
      return;
    }
    restoreDraftRef.current = false;

    setItems(draft.items);
    setExchangeRmb(draft.exchangeRmb);
    setExchangeUsd(draft.exchangeUsd);
    setShippingRateUsd(draft.shippingRateUsd);
    setShippingRateUnit(draft.shippingRateUnit);
    setShippingTypeId(draft.shippingTypeId);
    setShippingRateId(draft.shippingRateId);
    setMarkupPercent(draft.markupPercent);
    setAgentPercent(draft.agentPercent);
    setAgentCommitmentPercent(draft.agentCommitmentPercent);
    setCommitmentDueNgn(draft.commitmentDueNgn);
    setDepositEnabled(draft.depositEnabled);
    setDepositPercent(draft.depositPercent);
    setAgentNote(draft.agentNote);
    setPaymentPurpose(draft.paymentPurpose);
    setLatestQuoteToken(draft.latestQuoteToken);
    setLatestQuoteId(draft.latestQuoteId);
    viewingSavedQuoteRef.current = false;
  }, [activeHandoffId, showAllQuotes]);

  const resetToDefaults = useCallback(() => {
    setItems([
      {
        product_name: "",
        product_description: "",
        quantity: 1,
        unit_price_rmb: "",
        unit_weight_kg: "",
        unit_cbm: "",
        local_transport_rmb: "",
      },
    ]);
    setExchangeRmb(defaultSettings.exchangeRmb);
    setExchangeUsd(defaultSettings.exchangeUsd);
    setMarkupPercent(defaultSettings.markupPercent);
    setAgentPercent(defaultSettings.agentPercent);
    setAgentCommitmentPercent(defaultSettings.agentCommitmentPercent);
    setCommitmentDueNgn(defaultSettings.commitmentDueNgn);
    setDepositEnabled(false);
    setDepositPercent(0);
    setPaymentPurpose("full_product_payment");
    setAgentNote("");
    setLatestQuoteId(null);
    setLatestQuoteToken(null);
    setSaveMsg("New quote ready.");
    draftRef.current = null;
    restoreDraftRef.current = false;
    viewingSavedQuoteRef.current = false;
  }, [defaultSettings]);

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

  useEffect(() => {
    if (!linkMsg) return;
    const t = setTimeout(() => setLinkMsg(null), 2200);
    return () => clearTimeout(t);
  }, [linkMsg]);

  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 2400);
    return () => clearTimeout(t);
  }, [saveMsg]);

  useEffect(() => {
    if (!sendMsg) return;
    const t = setTimeout(() => setSendMsg(null), 2400);
    return () => clearTimeout(t);
  }, [sendMsg]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_name: "",
        product_description: "",
        quantity: 1,
        unit_price_rmb: "",
        unit_weight_kg: "",
        unit_cbm: "",
        local_transport_rmb: "",
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
    if (!activeHandoffId) {
      setError("handoff_id is required to create a quote.");
      return;
    }
    if (!approvedToClaim) {
      setError("You need to be approved to use this feature.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        handoff_id: activeHandoffId,
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
        setSaveMsg("Quote saved.");
      } else {
        setSuccess(`Quote #${json.id} created.`);
        setSaveMsg("Quote created.");
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

  const shellTitle = "Quote builder";
  const shellSubtitle = activeHandoffId
    ? `Drafting quote for handoff #${activeHandoffId}.`
    : "Create a quote for a specific handoff.";

  return (
    <AgentAppShell title={shellTitle} subtitle={shellSubtitle}>
      {!activeHandoffId ? (
        <div className="grid gap-4">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-neutral-600">Pick a project to start building a quote.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!approvedToClaim) {
                    setError("You need to be approved to use this feature.");
                    return;
                  }
                  setProjectPickerOpen(true);
                  loadProjects();
                }}
                className="btn btn-primary px-4 py-2 text-xs"
                disabled={!approvedToClaim}
              >
                Pick project
              </button>
            </div>
          </div>
          {error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {error}
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading quote builder…
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Project</p>
                <p className="mt-1 text-sm text-neutral-600">
                  Handoff #{activeHandoffId}
                  {activeConversationId ? ` · Conversation #${activeConversationId}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!approvedToClaim) {
                      setError("You need to be approved to use this feature.");
                      return;
                    }
                    setProjectPickerOpen(true);
                    loadProjects();
                  }}
                  className="btn btn-outline px-4 py-2 text-xs hover:bg-[rgba(45,52,97,0.08)] disabled:opacity-60"
                  disabled={!approvedToClaim}
                >
                  Pick project
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Saved quotes</p>
                <p className="mt-1 text-xs text-neutral-500">Select a previous quote or start fresh.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!showAllQuotes) {
                      if (!viewingSavedQuoteRef.current) {
                        draftRef.current = {
                          activeHandoffId,
                          activeConversationId,
                          items,
                          exchangeRmb,
                          exchangeUsd,
                          shippingRateUsd,
                          shippingRateUnit,
                          shippingTypeId,
                          shippingRateId,
                          markupPercent,
                          agentPercent,
                          agentCommitmentPercent,
                          commitmentDueNgn,
                          depositEnabled,
                          depositPercent,
                          agentNote,
                          paymentPurpose,
                          latestQuoteToken,
                          latestQuoteId,
                        };
                      }
                      setShowAllQuotes(true);
                      return;
                    }
                    suppressAutoSelectRef.current = true;
                    restoreDraftRef.current = true;
                    setShowAllQuotes(false);
                  }}
                  className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-xs font-semibold text-[#2D3461]"
                >
                  {showAllQuotes ? "All quotes" : "This project"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    showAllQuotes ? loadQuotes(undefined, "mine") : activeHandoffId ? loadQuotes(activeHandoffId) : null
                  }
                  className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-xs font-semibold text-[#2D3461]"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-xs font-semibold text-[#2D3461]"
                >
                  New quote
                </button>
              </div>
            </div>
            <div className="mt-3">
              {quotesLoading ? (
                <p className="text-xs text-neutral-500">Loading quotes…</p>
              ) : quotesError ? (
                <p className="text-xs text-amber-600">{quotesError}</p>
              ) : quotes.length ? (
                <div className="flex flex-wrap gap-2">
                  {quotes.map((q) => {
                    const selected = q.id === latestQuoteId;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          if (!viewingSavedQuoteRef.current) {
                            draftRef.current = {
                              activeHandoffId,
                              activeConversationId,
                              items,
                              exchangeRmb,
                              exchangeUsd,
                              shippingRateUsd,
                              shippingRateUnit,
                              shippingTypeId,
                              shippingRateId,
                              markupPercent,
                              agentPercent,
                              agentCommitmentPercent,
                              commitmentDueNgn,
                              depositEnabled,
                              depositPercent,
                              agentNote,
                              paymentPurpose,
                              latestQuoteToken,
                              latestQuoteId,
                            };
                          }
                          selectQuote(q);
                        }}
                        className={`rounded-2xl border px-3 py-2 text-left text-xs font-semibold ${
                          selected
                            ? "border-[#2D3461] bg-[#2D3461] text-white"
                            : "border-[rgba(45,52,97,0.2)] bg-white text-[#2D3461]"
                        }`}
                      >
                        <div>
                          Quote #{q.id}
                          {showAllQuotes && q.handoff_id ? ` · Handoff #${q.handoff_id}` : ""}
                        </div>
                        <div className={`mt-1 text-[10px] ${selected ? "text-white/80" : "text-neutral-500"}`}>
                          {q.payment_purpose || "payment"}
                          {q.created_at ? ` · ${String(q.created_at).slice(0, 10)}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">
                  {showAllQuotes ? "No quotes found yet." : `No quotes yet for handoff #${activeHandoffId}.`}
                </p>
              )}
              {saveMsg ? <p className="mt-2 text-[11px] text-neutral-500">{saveMsg}</p> : null}
            </div>
          </section>

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
          {!approvedToClaim ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              You need to be approved to use the quote builder.
            </section>
          ) : null}
          {activeHandoffId &&
          !["manufacturer_found", "paid", "shipped", "delivered"].includes(
            String(handoffStatus || "").toLowerCase()
          ) ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Quotes can only be created after the manufacturer is found.
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
                        type="text"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        inputMode="numeric"
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit price (RMB)</label>
                      <input
                        type="text"
                        value={item.unit_price_rmb}
                        onChange={(e) =>
                          updateItem(idx, {
                            unit_price_rmb: e.target.value,
                          })
                        }
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        inputMode="decimal"
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit weight (kg)</label>
                      <input
                        type="text"
                        value={item.unit_weight_kg}
                        onChange={(e) =>
                          updateItem(idx, {
                            unit_weight_kg: e.target.value,
                          })
                        }
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        inputMode="decimal"
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit CBM</label>
                      <input
                        type="text"
                        value={item.unit_cbm}
                        onChange={(e) =>
                          updateItem(idx, {
                            unit_cbm: e.target.value,
                          })
                        }
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        inputMode="decimal"
                        className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Local transport (RMB)</label>
                      <input
                        type="text"
                        value={item.local_transport_rmb}
                        onChange={(e) => updateItem(idx, { local_transport_rmb: num(e.target.value, 0) })}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        inputMode="decimal"
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
              <div className="mt-4">
                <PremiumSelect
                  label="Shipping type"
                  value={String(shippingRateId || selectedRate?.id || "")}
                  onChange={(value) => setShippingRateId(Number(value))}
                  options={shippingRates.map((rate) => ({
                    value: String(rate.id),
                    label: `${rate.shipping_type_name || "Shipping"} · ${rate.rate_value}/${
                      rate.rate_unit === "per_cbm" ? "CBM" : "KG"
                    }`,
                  }))}
                  placeholder="Select shipping type"
                  disabled={isReadOnly}
                />
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
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Payment purpose</p>
              <div className="mt-4">
                <PremiumSelect
                  label="Purpose"
                  value={paymentPurpose}
                  onChange={(value) => setPaymentPurpose(value)}
                  options={[
                    { value: "commitment_fee", label: "Commitment fee" },
                    { value: "deposit", label: "Deposit" },
                    { value: "product_balance", label: "Product balance" },
                    { value: "full_product_payment", label: "Full product payment" },
                    { value: "shipping_payment", label: "Shipping payment" },
                    { value: "additional_payment", label: "Additional payment" },
                  ]}
                  placeholder="Select payment purpose"
                  disabled={isReadOnly}
                />
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

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Quote actions</p>
                <p className="mt-1 text-sm text-neutral-500">Create a new quote or share the latest link.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
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
              {publicLink ? (
                <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-xs text-neutral-600">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Public link</p>
                  <p className="mt-2 break-all text-xs text-neutral-600">{publicLink}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(publicLink);
                          setLinkMsg("Link copied.");
                        } catch {
                          setLinkMsg("Unable to copy link.");
                        }
                      }}
                      className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-white"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (navigator.share) {
                            await navigator.share({ title: "LineScout quote", url: publicLink });
                          } else {
                            await navigator.clipboard.writeText(publicLink);
                            setLinkMsg("Link copied.");
                          }
                        } catch {}
                      }}
                      className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.2)]"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => setSendOpen(true)}
                      className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-white"
                    >
                      Send quote
                    </button>
                  </div>
                  {linkMsg ? <p className="mt-2 text-[11px] text-neutral-500">{linkMsg}</p> : null}
                  {sendMsg ? <p className="mt-2 text-[11px] text-neutral-500">{sendMsg}</p> : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {projectPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close project picker"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setProjectPickerOpen(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                Select project
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Pick a handoff</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Choose the project you want to build a quote for.
              </p>
              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
                {projectsLoading ? (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                    Loading projects…
                  </div>
                ) : projects.length ? (
                  projects.map((proj) => (
                    <button
                      key={proj.conversation_id}
                      type="button"
                      onClick={() => {
                        if (proj.handoff_id) {
                          setActiveHandoffId(proj.handoff_id);
                          setActiveConversationId(proj.conversation_id || null);
                          setShowAllQuotes(false);
                          setProjectPickerOpen(false);
                        }
                      }}
                      className="w-full rounded-2xl border border-[rgba(45,52,97,0.12)] bg-white px-4 py-3 text-left text-sm text-neutral-700 hover:bg-[rgba(45,52,97,0.04)]"
                    >
                      <p className="font-semibold text-neutral-900">
                        {proj.customer_name || "Customer"} · Handoff #{proj.handoff_id}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">{proj.route_type || ""}</p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                    No projects found.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[rgba(45,52,97,0.12)] bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setProjectPickerOpen(false)}
                className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={sendOpen}
        title="Send quote to customer?"
        description="This quote will be sent to the customer. You are sure everything is correct?"
        confirmText={sendLoading ? "Sending..." : "Send"}
        cancelText="Cancel"
        variant="light"
        onCancel={() => {
          if (sendLoading) return;
          setSendOpen(false);
        }}
        onConfirm={async () => {
          if (!latestQuoteId || sendLoading) {
            setSendOpen(false);
            return;
          }
          setSendLoading(true);
          setSendMsg(null);
          try {
            const res = await fetch("/api/internal/quotes/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ quote_id: latestQuoteId }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || "Failed to send quote.");
            }
            setSendMsg("Quote sent to customer.");
          } catch (e: any) {
            setSendMsg(e?.message || "Failed to send quote.");
          } finally {
            setSendLoading(false);
            setSendOpen(false);
          }
        }}
      />
    </AgentAppShell>
  );
}

export default function QuoteBuilderClient() {
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
