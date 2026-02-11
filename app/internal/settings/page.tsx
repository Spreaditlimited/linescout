"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../_components/SearchableSelect";
import ShippingCompaniesPanel from "../_components/ShippingCompaniesPanel";

type MeResponse =
  | { ok: true; user: { username: string; role: string } }
  | { ok: false; error: string };

type ManualHandoffResponse =
  | {
      ok: true;
      token: string;
      handoffId: number;
      customer_email: string;
      customer_name: string | null;
      status: string;
      handoff_type: string;
      total_due: number | null;
      currency: string;
    }
  | { ok: false; error: string };

type BankItem = { id: number; name: string; is_active?: number };

type SettingsItem = {
  id: number;
  commitment_due_ngn: number;
  agent_percent: number;
  agent_commitment_percent: number;
  markup_percent: number;
  points_value_ngn?: number;
  points_config_json?: any;
  exchange_rate_usd: number;
  exchange_rate_rmb: number;
  payout_summary_email?: string | null;
  agent_otp_mode?: "phone" | "email" | null;
};

type ShippingTypeItem = { id: number; name: string; is_active?: number };

type ShippingRateItem = {
  id: number;
  shipping_type_id: number;
  shipping_type_name: string;
  rate_value: number;
  rate_unit: "per_kg" | "per_cbm";
  currency: string;
  is_active?: number;
};

type Threshold = { max: number; points: number };
type PointsConfig = {
  claim_hours: Threshold[];
  manufacturer_hours: Threshold[];
  ship_days: Threshold[];
  response_minutes: Threshold[];
};

const defaultPointsConfig: PointsConfig = {
  claim_hours: [
    { max: 2, points: 15 },
    { max: 6, points: 12 },
    { max: 24, points: 8 },
    { max: 72, points: 4 },
  ],
  manufacturer_hours: [
    { max: 24, points: 20 },
    { max: 48, points: 16 },
    { max: 96, points: 10 },
    { max: 168, points: 5 },
  ],
  ship_days: [
    { max: 14, points: 20 },
    { max: 21, points: 14 },
    { max: 28, points: 8 },
  ],
  response_minutes: [
    { max: 30, points: 30 },
    { max: 120, points: 24 },
    { max: 360, points: 18 },
    { max: 1440, points: 10 },
  ],
};

export default function InternalSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  // Manual handoff modal
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ManualHandoffResponse | null>(null);

  // Banks (for dropdown + management)
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksErr, setBanksErr] = useState<string | null>(null);

  // Bank creation (settings)
  const [newBankName, setNewBankName] = useState("");
  const [creatingBank, setCreatingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const [bankCreateErr, setBankCreateErr] = useState<string | null>(null);

  // Global settings
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const [commitmentDue, setCommitmentDue] = useState("0");
  const [agentPercent, setAgentPercent] = useState("5");
  const [agentCommitmentPercent, setAgentCommitmentPercent] = useState("40");
  const [markupPercent, setMarkupPercent] = useState("20");
  const [pointsValue, setPointsValue] = useState("0");
  const [pointsConfig, setPointsConfig] = useState<PointsConfig>(defaultPointsConfig);
  const [exchangeUsd, setExchangeUsd] = useState("0");
  const [exchangeRmb, setExchangeRmb] = useState("0");
  const [payoutSummaryEmail, setPayoutSummaryEmail] = useState("");
  const [agentOtpMode, setAgentOtpMode] = useState<"phone" | "email">("phone");

  // Shipping types & rates
  const [shippingTypes, setShippingTypes] = useState<ShippingTypeItem[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRateItem[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingErr, setShippingErr] = useState<string | null>(null);
  const [newShippingType, setNewShippingType] = useState("");
  const [creatingShippingType, setCreatingShippingType] = useState(false);

  const [newRateTypeId, setNewRateTypeId] = useState<number | null>(null);
  const [newRateValue, setNewRateValue] = useState("");
  const [newRateUnit, setNewRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [creatingRate, setCreatingRate] = useState(false);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [editRateUnit, setEditRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [savingRate, setSavingRate] = useState(false);

  // Selected bank for initial payment inside manual handoff modal
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [notes, setNotes] = useState("");

  // Handoff defaults
  const [status, setStatus] = useState("pending");
  const [currency, setCurrency] = useState("NGN");

  // Optional financials + initial payment
  const [totalDue, setTotalDue] = useState<string>("");
  const [recordInitialPayment, setRecordInitialPayment] = useState(false);
  const [initialAmount, setInitialAmount] = useState<string>("");
  const [initialPurpose, setInitialPurpose] = useState<
    "downpayment" | "full_payment" | "shipping_payment" | "additional_payment"
  >("downpayment");
  const [initialNote, setInitialNote] = useState("");

  useEffect(() => {
    fetch("/internal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ ok: false, error: "Failed to load session" }));
  }, []);

  const isAdmin = !!(me && "ok" in me && me.ok && me.user.role === "admin");

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsErr(null);
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/internal/settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load settings");
      const item = data.item as SettingsItem;
      setCommitmentDue(String(item.commitment_due_ngn ?? 0));
      setAgentPercent(String(item.agent_percent ?? 0));
      setAgentCommitmentPercent(String(item.agent_commitment_percent ?? 0));
      setMarkupPercent(String(item.markup_percent ?? 0));
      setPointsValue(String(item.points_value_ngn ?? 0));
      if (item.points_config_json) {
        const raw = item.points_config_json;
        const parsed =
          typeof raw === "string"
            ? (() => {
                try {
                  return JSON.parse(raw);
                } catch {
                  return null;
                }
              })()
            : raw;
        if (parsed && typeof parsed === "object") {
          setPointsConfig({
            claim_hours: Array.isArray(parsed.claim_hours) ? parsed.claim_hours : defaultPointsConfig.claim_hours,
            manufacturer_hours: Array.isArray(parsed.manufacturer_hours)
              ? parsed.manufacturer_hours
              : defaultPointsConfig.manufacturer_hours,
            ship_days: Array.isArray(parsed.ship_days) ? parsed.ship_days : defaultPointsConfig.ship_days,
            response_minutes: Array.isArray(parsed.response_minutes)
              ? parsed.response_minutes
              : defaultPointsConfig.response_minutes,
          });
        }
      }
      setExchangeUsd(String(item.exchange_rate_usd ?? 0));
      setExchangeRmb(String(item.exchange_rate_rmb ?? 0));
      setPayoutSummaryEmail(String(item.payout_summary_email || ""));
      setAgentOtpMode(item.agent_otp_mode === "email" ? "email" : "phone");
    } catch (e: any) {
      setSettingsErr(e?.message || "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsErr(null);
    setSettingsMsg(null);
    if (!settingsValidation.ok) {
      setSettingsErr(settingsValidation.errors[0] || "Invalid settings.");
      return;
    }
    setSettingsLoading(true);
    try {
      const payload = {
        commitment_due_ngn: Number(commitmentDue),
        agent_percent: Number(agentPercent),
        agent_commitment_percent: Number(agentCommitmentPercent),
        markup_percent: Number(markupPercent),
        points_value_ngn: Number(pointsValue),
        points_config_json: pointsConfig,
        exchange_rate_usd: Number(exchangeUsd),
        exchange_rate_rmb: Number(exchangeRmb),
        payout_summary_email: payoutSummaryEmail.trim(),
        agent_otp_mode: agentOtpMode,
      };

      const res = await fetch("/api/internal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save settings");
      setSettingsMsg("Settings saved.");
    } catch (e: any) {
      setSettingsErr(e?.message || "Failed to save settings");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadShippingData() {
    setShippingLoading(true);
    setShippingErr(null);
    try {
      const [typesRes, ratesRes] = await Promise.all([
        fetch("/api/internal/shipping-types", { cache: "no-store" }),
        fetch("/api/internal/shipping-rates", { cache: "no-store" }),
      ]);
      const typesData = await typesRes.json().catch(() => null);
      const ratesData = await ratesRes.json().catch(() => null);
      if (!typesRes.ok || !typesData?.ok) throw new Error(typesData?.error || "Failed to load shipping types");
      if (!ratesRes.ok || !ratesData?.ok) throw new Error(ratesData?.error || "Failed to load shipping rates");

      const types = (typesData.items || []) as ShippingTypeItem[];
      setShippingTypes(types);
      setShippingRates((ratesData.items || []) as ShippingRateItem[]);
      if (!newRateTypeId && types.length) setNewRateTypeId(types[0].id);
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to load shipping data");
    } finally {
      setShippingLoading(false);
    }
  }

  async function createShippingType() {
    const name = newShippingType.trim();
    if (name.length < 2) {
      setShippingErr("Shipping type name is too short.");
      return;
    }
    setCreatingShippingType(true);
    try {
      const res = await fetch("/api/internal/shipping-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create shipping type");
      setNewShippingType("");
      await loadShippingData();
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to create shipping type");
    } finally {
      setCreatingShippingType(false);
    }
  }

  async function toggleShippingType(id: number, is_active: number) {
    try {
      await fetch("/api/internal/shipping-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      await loadShippingData();
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to update shipping type");
    }
  }

  async function createShippingRate() {
    if (!newRateTypeId) {
      setShippingErr("Select a shipping type.");
      return;
    }
    const rate = Number(newRateValue);
    if (!Number.isFinite(rate) || rate <= 0) {
      setShippingErr("Rate must be a positive USD number.");
      return;
    }
    const usdRate = Number(exchangeUsd);
    if (!Number.isFinite(usdRate) || usdRate <= 0) {
      setShippingErr("Set a valid USD → NGN exchange rate first.");
      return;
    }

    setCreatingRate(true);
    try {
      const res = await fetch("/api/internal/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_type_id: newRateTypeId,
          rate_value: rate,
          rate_unit: newRateUnit,
          currency: "USD",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create rate");
      setNewRateValue("");
      await loadShippingData();
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to create rate");
    } finally {
      setCreatingRate(false);
    }
  }

  async function toggleShippingRate(id: number, is_active: number) {
    try {
      await fetch("/api/internal/shipping-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      await loadShippingData();
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to update shipping rate");
    }
  }

  function startEditRate(rate: ShippingRateItem) {
    setEditingRateId(rate.id);
    setEditRateValue(String(rate.rate_value ?? ""));
    setEditRateUnit(rate.rate_unit);
  }

  function cancelEditRate() {
    setEditingRateId(null);
    setEditRateValue("");
    setEditRateUnit("per_kg");
  }

  async function saveRateEdit() {
    if (!editingRateId) return;
    const rateNum = Number(editRateValue);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setShippingErr("Rate must be a positive USD number.");
      return;
    }
    setSavingRate(true);
    try {
      const res = await fetch("/api/internal/shipping-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingRateId, rate_value: rateNum, rate_unit: editRateUnit }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update rate");
      await loadShippingData();
      cancelEditRate();
    } catch (e: any) {
      setShippingErr(e?.message || "Failed to update rate");
    } finally {
      setSavingRate(false);
    }
  }

  async function loadBanks() {
    setBanksLoading(true);
    setBanksErr(null);
    try {
      const res = await fetch("/api/linescout-banks", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load banks");
      setBanks((data.items || []) as BankItem[]);
    } catch (e: any) {
      setBanksErr(e?.message || "Failed to load banks");
    } finally {
      setBanksLoading(false);
    }
  }

  useEffect(() => {
    // Load banks once (for modal dropdown + settings list)
    loadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSettings();
    loadShippingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    const nameOk = customerName.trim().length > 0;
    const emailOk = customerEmail.trim().includes("@");
    const statusOk = status.trim().length > 0;

    if (!nameOk || !emailOk || !statusOk) return false;

    if (totalDue.trim()) {
      const td = Number(totalDue);
      if (Number.isNaN(td) || td < 0) return false;
    }

    if (recordInitialPayment) {
      const amt = Number(initialAmount);
      if (!amt || Number.isNaN(amt) || amt <= 0) return false;

      // require bank selection if recording payment
      if (!selectedBankId) return false;
    }

    return true;
  }, [
    customerName,
    customerEmail,
    status,
    totalDue,
    recordInitialPayment,
    initialAmount,
    selectedBankId,
  ]);

  const settingsValidation = useMemo(() => {
    const errors: string[] = [];
    const commitment = Number(commitmentDue);
    const agentPct = Number(agentPercent);
    const agentCommitPct = Number(agentCommitmentPercent);
    const markupPct = Number(markupPercent);
    const pointsValueNgn = Number(pointsValue);
    const usdRate = Number(exchangeUsd);
    const rmbRate = Number(exchangeRmb);
    const payoutEmail = payoutSummaryEmail.trim();
    const otpModeOk = agentOtpMode === "phone" || agentOtpMode === "email";
    const configOk = (label: string, list: Threshold[]) => {
      if (!Array.isArray(list) || list.length === 0) {
        errors.push(`${label} thresholds are required.`);
        return;
      }
      let prev = -1;
      list.forEach((t, idx) => {
        const max = Number(t?.max);
        const pts = Number(t?.points);
        if (!Number.isFinite(max) || max <= 0) {
          errors.push(`${label} row ${idx + 1}: max must be > 0`);
        }
        if (!Number.isFinite(pts) || pts < 0) {
          errors.push(`${label} row ${idx + 1}: points must be >= 0`);
        }
        if (max <= prev) {
          errors.push(`${label} row ${idx + 1}: max must increase`);
        }
        prev = max;
      });
    };

    if (!Number.isFinite(commitment) || commitment < 0) {
      errors.push("Commitment fee must be 0 or more.");
    }
    if (!Number.isFinite(agentPct) || agentPct < 0 || agentPct > 100) {
      errors.push("Agent earning (products) must be between 0 and 100.");
    }
    if (!Number.isFinite(agentCommitPct) || agentCommitPct < 0 || agentCommitPct > 100) {
      errors.push("Agent earning (commitment) must be between 0 and 100.");
    }
    if (!Number.isFinite(markupPct) || markupPct < 0 || markupPct > 100) {
      errors.push("Markup percent must be between 0 and 100.");
    }
    if (!Number.isFinite(pointsValueNgn) || pointsValueNgn < 0) {
      errors.push("Points value (NGN per point) must be 0 or more.");
    }
    if (!Number.isFinite(usdRate) || usdRate <= 0) {
      errors.push("Exchange rate USD → NGN must be greater than 0.");
    }
    if (!Number.isFinite(rmbRate) || rmbRate <= 0) {
      errors.push("Exchange rate RMB → NGN must be greater than 0.");
    }
    if (payoutEmail && !payoutEmail.includes("@")) {
      errors.push("Payout summary email must be a valid email.");
    }
    if (!otpModeOk) {
      errors.push("Agent OTP mode must be phone or email.");
    }
    configOk("Claim speed (hours)", pointsConfig.claim_hours);
    configOk("Manufacturer found (hours)", pointsConfig.manufacturer_hours);
    configOk("Payment to shipped (days)", pointsConfig.ship_days);
    configOk("Response time (minutes)", pointsConfig.response_minutes);

    return { ok: errors.length === 0, errors };
  }, [
    commitmentDue,
    agentPercent,
    agentCommitmentPercent,
    markupPercent,
    pointsValue,
    pointsConfig,
    exchangeUsd,
    exchangeRmb,
    payoutSummaryEmail,
    agentOtpMode,
  ]);

  const rateReady = useMemo(() => {
    const typeOk = !!newRateTypeId;
    const rate = Number(newRateValue);
    const rateOk = Number.isFinite(rate) && rate > 0;
    const usdOk = Number.isFinite(Number(exchangeUsd)) && Number(exchangeUsd) > 0;
    return typeOk && rateOk && usdOk;
  }, [newRateTypeId, newRateValue, exchangeUsd]);

  const fmtNaira = (value: number) => {
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
  };

  const fmtUsd = (value: number) => {
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
  };

  function updateThreshold(listKey: keyof PointsConfig, index: number, field: "max" | "points", value: string) {
    const num = Number(value);
    setPointsConfig((prev) => {
      const list = [...(prev[listKey] || [])];
      const item = { ...list[index], [field]: Number.isFinite(num) ? num : 0 };
      list[index] = item;
      return { ...prev, [listKey]: list };
    });
  }

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setWhatsApp("");
    setNotes("");
    setStatus("pending");
    setCurrency("NGN");
    setTotalDue("");
    setRecordInitialPayment(false);
    setInitialAmount("");
    setInitialPurpose("downpayment");
    setInitialNote("");
    setSelectedBankId(null);
    setResult(null);
  }

  async function submitManualHandoff() {
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);

    try {
      const payload: any = {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || null,
        whatsapp_number: whatsApp.trim() || null,
        notes: notes.trim() || null,
        status: status.trim() || "pending",
        currency: currency.trim() || "NGN",
        total_due: totalDue.trim() ? Number(totalDue) : null,
        initial_payment: recordInitialPayment
          ? {
              amount: Number(initialAmount),
              purpose: initialPurpose,
              note: initialNote.trim() || null,
              bank_id: selectedBankId, // key addition
            }
          : null,
      };

      // Optional: also send bank_id at root (safe if backend ignores)
      if (recordInitialPayment) payload.bank_id = selectedBankId;

      const res = await fetch("/api/linescout-handoffs/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ManualHandoffResponse;
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Failed to create manual handoff" });
    } finally {
      setSubmitting(false);
    }
  }

  async function createBank() {
    setBankMsg(null);
    setBankCreateErr(null);

    const name = newBankName.trim();
    if (name.length < 2) {
      setBankCreateErr("Bank name is too short.");
      return;
    }

    setCreatingBank(true);
    try {
      const res = await fetch("/api/linescout-banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to create bank");

      setNewBankName("");
      setBankMsg(`Created bank "${name}".`);
      await loadBanks();
    } catch (e: any) {
      setBankCreateErr(e?.message || "Failed to create bank");
    } finally {
      setCreatingBank(false);
    }
  }

  if (!me) return <p className="text-sm text-neutral-400">Loading...</p>;

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
        <p className="mt-1 text-sm text-neutral-400">Admins only.</p>
      </div>
    );
  }

  const activeBanks = banks.filter((b) => b.is_active !== 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Admin controls: agents, access, credentials, and onboarding tools.
            </p>
          </div>

          <div />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Global pricing & earnings</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Fixed commitment fee (NGN), exchange rates, markup, and agent earnings.
            </p>
          </div>
          <button
            onClick={saveSettings}
            disabled={settingsLoading || !settingsValidation.ok}
            className="inline-flex items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-white disabled:opacity-60"
          >
            {settingsLoading ? "Saving..." : "Save settings"}
          </button>
        </div>

        {settingsErr ? (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {settingsErr}
          </div>
        ) : null}

        {!settingsValidation.ok ? (
          <div className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {settingsValidation.errors[0]}
          </div>
        ) : null}

        {settingsMsg ? (
          <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            {settingsMsg}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-neutral-300">Commitment fee (NGN)</label>
            <input
              value={commitmentDue}
              onChange={(e) => setCommitmentDue(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="50000"
              inputMode="decimal"
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              {fmtNaira(Number(commitmentDue || 0))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Agent earning % (products)</label>
            <input
              value={agentPercent}
              onChange={(e) => setAgentPercent(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="5"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Agent earning % (commitment)</label>
            <input
              value={agentCommitmentPercent}
              onChange={(e) => setAgentCommitmentPercent(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="40"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Markup %</label>
            <input
              value={markupPercent}
              onChange={(e) => setMarkupPercent(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="20"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Points value (NGN per point)</label>
            <input
              value={pointsValue}
              onChange={(e) => setPointsValue(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="100"
              inputMode="decimal"
            />
          </div>
          <div className="sm:col-span-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-neutral-100">Agent points scoring</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Configure time thresholds and points for each transition.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <p className="text-sm font-semibold text-neutral-200">Claim speed (hours)</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  {pointsConfig.claim_hours.map((row, idx) => (
                    <div key={`claim-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <label className="text-xs font-medium text-neutral-300">Max hours</label>
                      <input
                        value={row.max}
                        onChange={(e) => updateThreshold("claim_hours", idx, "max", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                      <label className="mt-2 block text-xs font-medium text-neutral-300">Points</label>
                      <input
                        value={row.points}
                        onChange={(e) => updateThreshold("claim_hours", idx, "points", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-200">Manufacturer found (hours)</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  {pointsConfig.manufacturer_hours.map((row, idx) => (
                    <div key={`mfg-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <label className="text-xs font-medium text-neutral-300">Max hours</label>
                      <input
                        value={row.max}
                        onChange={(e) => updateThreshold("manufacturer_hours", idx, "max", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                      <label className="mt-2 block text-xs font-medium text-neutral-300">Points</label>
                      <input
                        value={row.points}
                        onChange={(e) => updateThreshold("manufacturer_hours", idx, "points", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-200">Payment to shipped (days)</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {pointsConfig.ship_days.map((row, idx) => (
                    <div key={`ship-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <label className="text-xs font-medium text-neutral-300">Max days</label>
                      <input
                        value={row.max}
                        onChange={(e) => updateThreshold("ship_days", idx, "max", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                      <label className="mt-2 block text-xs font-medium text-neutral-300">Points</label>
                      <input
                        value={row.points}
                        onChange={(e) => updateThreshold("ship_days", idx, "points", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-200">Response time (minutes)</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  {pointsConfig.response_minutes.map((row, idx) => (
                    <div key={`resp-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <label className="text-xs font-medium text-neutral-300">Max minutes</label>
                      <input
                        value={row.max}
                        onChange={(e) => updateThreshold("response_minutes", idx, "max", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                      <label className="mt-2 block text-xs font-medium text-neutral-300">Points</label>
                      <input
                        value={row.points}
                        onChange={(e) => updateThreshold("response_minutes", idx, "points", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        inputMode="decimal"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Exchange rate (USD → NGN)</label>
            <input
              value={exchangeUsd}
              onChange={(e) => setExchangeUsd(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="1500"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-300">Exchange rate (RMB → NGN)</label>
            <input
              value={exchangeRmb}
              onChange={(e) => setExchangeRmb(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="210"
              inputMode="decimal"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="text-sm font-medium text-neutral-300">Payout summary email (daily)</label>
            <input
              value={payoutSummaryEmail}
              onChange={(e) => setPayoutSummaryEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="hello@sureimports.com"
              inputMode="email"
            />
            <div className="mt-1 text-xs text-neutral-400">
              Receives a daily payout summary at 8:00 AM Lagos time.
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="text-sm font-medium text-neutral-300">Agent OTP mode</label>
            <SearchableSelect
              className="mt-2"
              value={agentOtpMode}
              options={[
                { value: "phone", label: "Phone OTP (SMS)" },
                { value: "email", label: "Email OTP" },
              ]}
              onChange={(next) => setAgentOtpMode(next === "email" ? "email" : "phone")}
            />
            <div className="mt-1 text-xs text-neutral-400">
              Controls agent verification during sign in and onboarding.
            </div>
          </div>

        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Shipping types</div>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={newShippingType}
                onChange={(e) => setNewShippingType(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Air, Sea"
              />
              <button
                onClick={createShippingType}
                disabled={creatingShippingType}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
              >
                {creatingShippingType ? "Saving..." : "Add"}
              </button>
            </div>

            {shippingLoading ? (
              <div className="mt-3 text-xs text-neutral-500">Loading...</div>
            ) : shippingTypes.length ? (
              <div className="mt-3 space-y-2">
                {shippingTypes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
                    <span>{t.name}</span>
                    <button
                      onClick={() => toggleShippingType(t.id, t.is_active === 0 ? 1 : 0)}
                      className="text-xs text-neutral-400 hover:text-neutral-100"
                    >
                      {t.is_active === 0 ? "Activate" : "Deactivate"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-neutral-500">No shipping types yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Shipping rates</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <SearchableSelect
                value={newRateTypeId ? String(newRateTypeId) : ""}
                options={[
                  { value: "", label: "Select shipping type" },
                  ...shippingTypes.map((t) => ({ value: String(t.id), label: t.name })),
                ]}
                onChange={(next) => setNewRateTypeId(next ? Number(next) : null)}
              />
              <input
                value={newRateValue}
                onChange={(e) => setNewRateValue(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Rate value (USD)"
              />
              {(() => {
                const rate = Number(newRateValue);
                const usdOk = Number.isFinite(rate) && rate > 0;
                const usdRate = usdOk ? rate : 0;
                const exchange = Number(exchangeUsd || 0);
                const ngnRate = usdOk && Number.isFinite(exchange) && exchange > 0 ? usdRate * exchange : 0;
                if (!Number.isFinite(exchange) || exchange <= 0) {
                  return (
                    <div className="text-[11px] text-amber-200">
                      Set USD → NGN exchange rate to compute NGN equivalent.
                    </div>
                  );
                }
                return (
                  <div className="text-[11px] text-neutral-500">
                    {fmtUsd(usdRate)} → {fmtNaira(ngnRate)} (NGN equivalent)
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <SearchableSelect
                  value={newRateUnit}
                  options={[
                    { value: "per_kg", label: "Per KG" },
                    { value: "per_cbm", label: "Per CBM" },
                  ]}
                  onChange={(next) => setNewRateUnit(next as "per_kg" | "per_cbm")}
                />
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-500 flex items-center">
                  USD (base)
                </div>
              </div>
              <button
                onClick={createShippingRate}
                disabled={creatingRate || !rateReady}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
              >
                {creatingRate ? "Saving..." : "Add rate"}
              </button>
            </div>

            {shippingLoading ? (
              <div className="mt-3 text-xs text-neutral-500">Loading...</div>
            ) : shippingRates.length ? (
              <div className="mt-3 space-y-2">
                {shippingRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
                    {editingRateId === r.id ? (
                      <div className="flex-1">
                        <div className="font-semibold">{r.shipping_type_name}</div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                          <input
                            value={editRateValue}
                            onChange={(e) => setEditRateValue(e.target.value)}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                            placeholder="USD rate"
                          />
                          <SearchableSelect
                            value={editRateUnit}
                            options={[
                              { value: "per_kg", label: "Per KG" },
                              { value: "per_cbm", label: "Per CBM" },
                            ]}
                            onChange={(next) => setEditRateUnit(next as "per_kg" | "per_cbm")}
                          />
                        </div>
                        <div className="mt-2 text-[11px] text-neutral-500">
                          {(() => {
                            const usd = Number(editRateValue || 0);
                            const ex = Number(exchangeUsd || 0);
                            if (!Number.isFinite(usd) || !Number.isFinite(ex) || ex <= 0) return "NGN 0";
                            return `${fmtUsd(usd)} → ${fmtNaira(usd * ex)}`;
                          })()}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={saveRateEdit}
                            disabled={savingRate}
                            className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
                          >
                            {savingRate ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEditRate}
                            className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="font-semibold">{r.shipping_type_name}</div>
                          <div className="text-neutral-400">
                            {fmtUsd(Number(r.rate_value || 0))} / {r.rate_unit === "per_kg" ? "KG" : "CBM"}
                          </div>
                          <div className="text-neutral-500">
                            {(() => {
                              const usd = Number(r.rate_value || 0);
                              const ex = Number(exchangeUsd || 0);
                              if (!Number.isFinite(usd) || !Number.isFinite(ex) || ex <= 0) return "NGN 0";
                              return fmtNaira(usd * ex);
                            })()}{" "}
                            (NGN equivalent)
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditRate(r)}
                            className="text-xs text-neutral-400 hover:text-neutral-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleShippingRate(r.id, r.is_active === 0 ? 1 : 0)}
                            className="text-xs text-neutral-400 hover:text-neutral-100"
                          >
                            {r.is_active === 0 ? "Activate" : "Deactivate"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-neutral-500">No shipping rates yet.</div>
            )}
          </div>
        </div>

        {shippingErr ? (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {shippingErr}
          </div>
        ) : null}
      </div>

      {/* Manual onboarding card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">Manual onboarding</h3>
            <p className="mt-1 text-sm text-neutral-400">
              For customers who paid via bank transfer. Creates a sourcing token (SRC-...) and a
              sourcing handoff record. Optional: set total due and record an initial payment.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="inline-flex shrink-0 whitespace-nowrap items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white active:scale-[0.99]"
          >
            Create manual handoff
          </button>
        </div>
      </div>

      <ShippingCompaniesPanel />

      {/* Banks panel */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Banks</h3>
            <p className="text-xs text-neutral-400">
              Maintain the list of banks customers pay into. Used during manual onboarding and payment logging.
            </p>
          </div>

          <div className="w-full lg:max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-semibold text-neutral-100">Add bank</div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-neutral-400">Bank name</label>
                <input
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="e.g. Access Bank"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createBank}
                  disabled={creatingBank}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60"
                >
                  {creatingBank ? "Adding..." : "Add"}
                </button>

                <button
                  onClick={loadBanks}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            {bankMsg ? (
              <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                {bankMsg}
              </div>
            ) : null}

            {bankCreateErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {bankCreateErr}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          {banksLoading ? <p className="text-sm text-neutral-400">Loading banks...</p> : null}
          {banksErr ? <p className="text-sm text-red-300">{banksErr}</p> : null}

          {!banksLoading && !banksErr ? (
            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/70 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Active</th>
                  </tr>
                </thead>
                <tbody className="bg-neutral-950">
                  {banks.map((b) => (
                    <tr key={b.id} className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-neutral-100">{b.name}</td>
                      <td className="px-3 py-2 text-neutral-200">
                        {b.is_active === 0 ? "No" : "Yes"}
                      </td>
                    </tr>
                  ))}
                  {banks.length === 0 ? (
                    <tr className="border-t border-neutral-800">
                      <td className="px-3 py-3 text-neutral-400" colSpan={2}>
                        No banks yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6">
          <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Create manual handoff</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  This will generate a Request ID token and onboard the customer into the LineScout
                  sourcing handoff system.
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4">
              {result && (
                <div
                  className={`mb-4 rounded-2xl border p-4 ${
                    result.ok
                      ? "border-emerald-900 bg-emerald-950/30"
                      : "border-red-900 bg-red-950/30"
                  }`}
                >
                  {result.ok ? (
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Created successfully</p>
                      <p className="mt-1 text-sm text-neutral-200">
                        Request ID (Token):{" "}
                        <span className="break-all font-mono font-semibold text-emerald-300">
                          {result.token}
                        </span>
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-neutral-400 sm:grid-cols-2">
                        <p>Handoff ID: {result.handoffId}</p>
                        <p>Status: {result.status}</p>
                        <p>Type: {result.handoff_type}</p>
                        <p>Email: {result.customer_email}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Failed</p>
                      <p className="mt-1 text-sm text-neutral-300">{result.error}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Customer
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer email</label>
                  <input
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. john@example.com"
                    inputMode="email"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    Customer phone (optional)
                  </label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    WhatsApp number (optional)
                  </label>
                  <input
                    value={whatsApp}
                    onChange={(e) => setWhatsApp(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-300">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 min-h-[90px] w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Short context: what they’re sourcing, what they paid for, any key details."
                  />
                </div>

                <div className="sm:col-span-2">
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Handoff
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Initial status</label>
                  <input
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="pending"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Default is pending. You can change it if you need.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Currency</label>
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="NGN"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Total due (optional)</label>
                  <input
                    value={totalDue}
                    onChange={(e) => setTotalDue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 1500000"
                    inputMode="decimal"
                  />
                </div>

                <div className="hidden sm:block" />

                {/* Initial Payment */}
                <div className="sm:col-span-2 mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">
                        Initial payment (optional)
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        If you want to record a bank transfer payment immediately, enable this.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-neutral-200">
                      <input
                        type="checkbox"
                        checked={recordInitialPayment}
                        onChange={(e) => {
                          setRecordInitialPayment(e.target.checked);
                          if (!e.target.checked) setSelectedBankId(null);
                        }}
                        className="h-4 w-4"
                      />
                      Record payment
                    </label>
                  </div>

                  {recordInitialPayment && (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-neutral-300">Amount</label>
                        <input
                          value={initialAmount}
                          onChange={(e) => setInitialAmount(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                          placeholder="e.g. 500000"
                          inputMode="decimal"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-neutral-300">Purpose</label>
                        <SearchableSelect
                          className="mt-1"
                          value={initialPurpose}
                          options={[
                            { value: "downpayment", label: "downpayment" },
                            { value: "full_payment", label: "full_payment" },
                            { value: "shipping_payment", label: "shipping_payment" },
                            { value: "additional_payment", label: "additional_payment" },
                          ]}
                          onChange={(next) => setInitialPurpose(next as any)}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-neutral-300">Bank</label>
                        <SearchableSelect
                          className="mt-1"
                          value={selectedBankId ? String(selectedBankId) : ""}
                          options={[
                            { value: "", label: "Select bank" },
                            ...activeBanks.map((b) => ({ value: String(b.id), label: b.name })),
                          ]}
                          onChange={(next) => {
                            const v = next ? Number(next) : null;
                            setSelectedBankId(v);
                          }}
                        />
                        <p className="mt-1 text-xs text-neutral-500">
                          Required when recording a payment.
                        </p>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-neutral-300">
                          Payment note (optional)
                        </label>
                        <input
                          value={initialNote}
                          onChange={(e) => setInitialNote(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                          placeholder="e.g. Bank transfer ref: ABC123"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex flex-col gap-2 border-t border-neutral-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
                disabled={submitting}
              >
                Reset
              </button>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  onClick={submitManualHandoff}
                  className="inline-flex items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-60"
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? "Creating..." : "Create handoff"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
