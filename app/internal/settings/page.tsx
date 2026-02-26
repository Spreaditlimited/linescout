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
      conversationId?: number;
      customer_email: string;
      customer_name: string | null;
      status: string;
      handoff_type: string;
      total_due: number | null;
      currency: string;
    }
  | { ok: false; error: string };

type BankItem = { id: number; name: string; is_active?: number };
type UserSearchItem = {
  id: number;
  email: string;
  display_name?: string | null;
  customer_name?: string | null;
  whatsapp_number?: string | null;
  display_currency_code?: string | null;
  payment_provider?: string | null;
};

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
  test_emails_json?: any;
  max_active_claims?: number;
  white_label_trial_days?: number;
  white_label_daily_reveals?: number;
  white_label_insights_daily_limit?: number;
  white_label_monthly_price_gbp?: number | null;
  white_label_yearly_price_gbp?: number | null;
  white_label_monthly_price_cad?: number | null;
  white_label_yearly_price_cad?: number | null;
  white_label_subscription_countries?: string | null;
  white_label_paypal_product_id?: string | null;
  white_label_paypal_plan_monthly_gbp?: string | null;
  white_label_paypal_plan_yearly_gbp?: string | null;
  white_label_paypal_plan_monthly_cad?: string | null;
  white_label_paypal_plan_yearly_cad?: string | null;
};

type ShippingTypeItem = { id: number; name: string; is_active?: number };

type ShippingRateItem = {
  id: number;
  shipping_type_id: number;
  shipping_type_name: string;
  rate_value: number;
  rate_unit: "per_kg" | "per_cbm";
  currency: string;
  country_id?: number | null;
  country_name?: string | null;
  country_iso2?: string | null;
  is_active?: number;
};

type CurrencyItem = {
  id: number;
  code: string;
  symbol?: string | null;
  decimal_places?: number;
  display_format?: string | null;
  is_active?: number;
};

type CountryItem = {
  id: number;
  name: string;
  iso2: string;
  iso3?: string | null;
  default_currency_id?: number | null;
  default_currency_code?: string | null;
  settlement_currency_code?: string | null;
  payment_provider?: string | null;
  is_active?: number;
};

type CountryCurrencyItem = {
  country_id: number;
  currency_id: number;
  country_name?: string | null;
  country_iso2?: string | null;
  currency_code?: string | null;
  is_active?: number;
};

type FxRateItem = {
  id: number;
  base_currency_code: string;
  quote_currency_code: string;
  rate: number;
  effective_at?: string | null;
  created_at?: string | null;
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
  const [routeType, setRouteType] = useState<"machine_sourcing" | "white_label" | "simple_sourcing">(
    "machine_sourcing"
  );
  const [userQuery, setUserQuery] = useState("");
  const [userSearch, setUserSearch] = useState<UserSearchItem[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchErr, setUserSearchErr] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

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
  const [testEmailsText, setTestEmailsText] = useState("");
  const [maxActiveClaims, setMaxActiveClaims] = useState("3");
  const [whiteLabelTrialDays, setWhiteLabelTrialDays] = useState("3");
  const [whiteLabelDailyReveals, setWhiteLabelDailyReveals] = useState("10");
  const [whiteLabelDailyInsights, setWhiteLabelDailyInsights] = useState("2");
  const [whiteLabelMonthlyPriceGbp, setWhiteLabelMonthlyPriceGbp] = useState("");
  const [whiteLabelYearlyPriceGbp, setWhiteLabelYearlyPriceGbp] = useState("");
  const [whiteLabelMonthlyPriceCad, setWhiteLabelMonthlyPriceCad] = useState("");
  const [whiteLabelYearlyPriceCad, setWhiteLabelYearlyPriceCad] = useState("");
  const [whiteLabelSubscriptionCountries, setWhiteLabelSubscriptionCountries] = useState("GB,CA");
  const [whiteLabelPaypalProductId, setWhiteLabelPaypalProductId] = useState("");
  const [whiteLabelPaypalMonthlyGbp, setWhiteLabelPaypalMonthlyGbp] = useState("");
  const [whiteLabelPaypalYearlyGbp, setWhiteLabelPaypalYearlyGbp] = useState("");
  const [whiteLabelPaypalMonthlyCad, setWhiteLabelPaypalMonthlyCad] = useState("");
  const [whiteLabelPaypalYearlyCad, setWhiteLabelPaypalYearlyCad] = useState("");

  const [wlExemptions, setWlExemptions] = useState<any[]>([]);
  const [wlExemptionsLoading, setWlExemptionsLoading] = useState(false);
  const [wlExemptionsErr, setWlExemptionsErr] = useState<string | null>(null);
  const [wlExemptionsSearch, setWlExemptionsSearch] = useState("");
  const [wlExemptionsDebounced, setWlExemptionsDebounced] = useState("");
  const [wlExemptionsEmail, setWlExemptionsEmail] = useState("");
  const [wlExemptionsMonths, setWlExemptionsMonths] = useState("3");
  const [wlExemptionsNotes, setWlExemptionsNotes] = useState("");
  const [wlExemptionsCsvName, setWlExemptionsCsvName] = useState<string | null>(null);
  const [wlExemptionsCsvText, setWlExemptionsCsvText] = useState("");
  const [wlExemptionsCsvMsg, setWlExemptionsCsvMsg] = useState<string | null>(null);
  const [wlExemptionsCsvUploading, setWlExemptionsCsvUploading] = useState(false);

  const [paypalPlanLoading, setPaypalPlanLoading] = useState(false);
  const [paypalPlanMsg, setPaypalPlanMsg] = useState<string | null>(null);
  const [paypalPlanErr, setPaypalPlanErr] = useState<string | null>(null);

  // Countries & currencies (Phase 1)
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [countryCurrencies, setCountryCurrencies] = useState<CountryCurrencyItem[]>([]);
  const [fxRates, setFxRates] = useState<FxRateItem[]>([]);
  const [countryErr, setCountryErr] = useState<string | null>(null);
  const [currencyErr, setCurrencyErr] = useState<string | null>(null);
  const [fxErr, setFxErr] = useState<string | null>(null);

  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("");
  const [newCurrencyDecimals, setNewCurrencyDecimals] = useState("2");
  const [newCurrencyFormat, setNewCurrencyFormat] = useState("");

  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryIso2, setNewCountryIso2] = useState("");
  const [newCountryIso3, setNewCountryIso3] = useState("");
  const [newCountryDefaultCurrencyId, setNewCountryDefaultCurrencyId] = useState<number | null>(null);
  const [newCountrySettlement, setNewCountrySettlement] = useState("");
  const [newCountryProvider, setNewCountryProvider] = useState("");

  const [editingCountryId, setEditingCountryId] = useState<number | null>(null);
  const [editCountryName, setEditCountryName] = useState("");
  const [editCountryIso2, setEditCountryIso2] = useState("");
  const [editCountryIso3, setEditCountryIso3] = useState("");
  const [editCountryDefaultCurrencyId, setEditCountryDefaultCurrencyId] = useState<number | null>(null);
  const [editCountrySettlement, setEditCountrySettlement] = useState("");
  const [editCountryProvider, setEditCountryProvider] = useState("");

  const [editingCurrencyId, setEditingCurrencyId] = useState<number | null>(null);
  const [editCurrencySymbol, setEditCurrencySymbol] = useState("");
  const [editCurrencyDecimals, setEditCurrencyDecimals] = useState("2");
  const [editCurrencyFormat, setEditCurrencyFormat] = useState("");

  const [newCountryCurrencyCountryId, setNewCountryCurrencyCountryId] = useState<number | null>(null);
  const [newCountryCurrencyCurrencyId, setNewCountryCurrencyCurrencyId] = useState<number | null>(null);

  const [newFxBase, setNewFxBase] = useState("");
  const [newFxQuote, setNewFxQuote] = useState("");
  const [newFxRate, setNewFxRate] = useState("");

  // Shipping types & rates
  const [shippingTypes, setShippingTypes] = useState<ShippingTypeItem[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRateItem[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingErr, setShippingErr] = useState<string | null>(null);
  const [newShippingType, setNewShippingType] = useState("");
  const [creatingShippingType, setCreatingShippingType] = useState(false);

  const [newRateTypeId, setNewRateTypeId] = useState<number | null>(null);
  const [newRateCountryId, setNewRateCountryId] = useState<number | null>(null);
  const [newRateValue, setNewRateValue] = useState("");
  const [newRateUnit, setNewRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [creatingRate, setCreatingRate] = useState(false);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [editingRateCountryId, setEditingRateCountryId] = useState<number | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [editRateUnit, setEditRateUnit] = useState<"per_kg" | "per_cbm">("per_kg");
  const [savingRate, setSavingRate] = useState(false);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [notes, setNotes] = useState("");

  // Handoff defaults
  const [status, setStatus] = useState("pending");
  const [currency, setCurrency] = useState("NGN");
  const [paymentSource, setPaymentSource] = useState<"paystack" | "paypal">("paystack");
  const [userDisplayCurrency, setUserDisplayCurrency] = useState<string>("");
  const [paymentRef, setPaymentRef] = useState("");

  // Optional financials + initial payment
  const [totalDue, setTotalDue] = useState<string>("");

  useEffect(() => {
    fetch("/internal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ ok: false, error: "Failed to load session" }));
  }, []);

  useEffect(() => {
    if (paymentSource === "paystack") {
      setCurrency("NGN");
      return;
    }
    const next = userDisplayCurrency || "GBP";
    setCurrency(next);
  }, [paymentSource, userDisplayCurrency]);

  const isAdmin = !!(me && "ok" in me && me.ok && me.user.role === "admin");

  useEffect(() => {
    const t = setTimeout(() => setWlExemptionsDebounced(wlExemptionsSearch), 200);
    return () => clearTimeout(t);
  }, [wlExemptionsSearch]);

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsErr(null);
    setSettingsMsg(null);
    setCountryErr(null);
    setCurrencyErr(null);
    setFxErr(null);
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
      setMaxActiveClaims(String(item.max_active_claims ?? 3));
      setWhiteLabelTrialDays(String(item.white_label_trial_days ?? 3));
      setWhiteLabelDailyReveals(String(item.white_label_daily_reveals ?? 10));
      setWhiteLabelDailyInsights(String(item.white_label_insights_daily_limit ?? 2));
      setWhiteLabelMonthlyPriceGbp(
        item.white_label_monthly_price_gbp != null ? String(item.white_label_monthly_price_gbp) : ""
      );
      setWhiteLabelYearlyPriceGbp(
        item.white_label_yearly_price_gbp != null ? String(item.white_label_yearly_price_gbp) : ""
      );
      setWhiteLabelMonthlyPriceCad(
        item.white_label_monthly_price_cad != null ? String(item.white_label_monthly_price_cad) : ""
      );
      setWhiteLabelYearlyPriceCad(
        item.white_label_yearly_price_cad != null ? String(item.white_label_yearly_price_cad) : ""
      );
      setWhiteLabelSubscriptionCountries(String(item.white_label_subscription_countries || "GB,CA"));
      setWhiteLabelPaypalProductId(String(item.white_label_paypal_product_id || ""));
      setWhiteLabelPaypalMonthlyGbp(String(item.white_label_paypal_plan_monthly_gbp || ""));
      setWhiteLabelPaypalYearlyGbp(String(item.white_label_paypal_plan_yearly_gbp || ""));
      setWhiteLabelPaypalMonthlyCad(String(item.white_label_paypal_plan_monthly_cad || ""));
      setWhiteLabelPaypalYearlyCad(String(item.white_label_paypal_plan_yearly_cad || ""));
      if (item.test_emails_json) {
        const raw = item.test_emails_json;
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
        if (Array.isArray(parsed)) {
          setTestEmailsText(parsed.filter(Boolean).join("\n"));
        } else {
          setTestEmailsText("");
        }
      } else {
        setTestEmailsText("");
      }
      setCountries((data.countries || []) as CountryItem[]);
      setCurrencies((data.currencies || []) as CurrencyItem[]);
      setCountryCurrencies((data.country_currencies || []) as CountryCurrencyItem[]);
      setFxRates((data.fx_rates || []) as FxRateItem[]);
      if (!newCountryDefaultCurrencyId && data?.currencies?.length) {
        setNewCountryDefaultCurrencyId(data.currencies[0].id);
      }
      if (!newCountryCurrencyCountryId && data?.countries?.length) {
        setNewCountryCurrencyCountryId(data.countries[0].id);
      }
      if (!newCountryCurrencyCurrencyId && data?.currencies?.length) {
        setNewCountryCurrencyCurrencyId(data.currencies[0].id);
      }
      if (!newRateCountryId && data?.countries?.length) {
        setNewRateCountryId(data.countries[0].id);
      }
    } catch (e: any) {
      setSettingsErr(e?.message || "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadWhiteLabelExemptions() {
    setWlExemptionsLoading(true);
    setWlExemptionsErr(null);
    try {
      const qs = new URLSearchParams();
      if (wlExemptionsDebounced.trim()) qs.set("q", wlExemptionsDebounced.trim());
      const res = await fetch(`/api/internal/admin/white-label-exemptions?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load exemptions");
      setWlExemptions(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setWlExemptionsErr(e?.message || "Failed to load exemptions");
    } finally {
      setWlExemptionsLoading(false);
    }
  }

  async function createWhiteLabelExemption() {
    setWlExemptionsErr(null);
    try {
      const res = await fetch("/api/internal/admin/white-label-exemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: wlExemptionsEmail.trim(),
          months: Number(wlExemptionsMonths),
          notes: wlExemptionsNotes.trim(),
          source: "manual",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create exemption");
      setWlExemptionsEmail("");
      setWlExemptionsMonths("3");
      setWlExemptionsNotes("");
      await loadWhiteLabelExemptions();
    } catch (e: any) {
      setWlExemptionsErr(e?.message || "Failed to create exemption");
    }
  }

  async function handleWlExemptionsCsvFile(file: File) {
    setWlExemptionsCsvMsg(null);
    setWlExemptionsCsvName(file.name);
    const text = await file.text();
    setWlExemptionsCsvText(text);
  }

  async function uploadWlExemptionsCsv() {
    if (!wlExemptionsCsvText.trim()) {
      setWlExemptionsCsvMsg("Select a CSV file first.");
      return;
    }
    setWlExemptionsCsvUploading(true);
    setWlExemptionsCsvMsg(null);
    try {
      const res = await fetch("/api/internal/admin/white-label-exemptions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: wlExemptionsCsvText }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import failed.");
      setWlExemptionsCsvMsg(`Imported. Added ${data.inserted || 0}, skipped ${data.skipped || 0}.`);
      await loadWhiteLabelExemptions();
    } catch (e: any) {
      setWlExemptionsCsvMsg(e?.message || "Import failed.");
    } finally {
      setWlExemptionsCsvUploading(false);
    }
  }

  function downloadWlExemptionsTemplate() {
    const header = ["email", "months", "notes"].join(",");
    const sample = ["student@example.com", "6", "Course cohort A"].join(",");
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "white-label-exemptions-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function adminAction(action: string, payload: Record<string, any>) {
    const res = await fetch("/api/internal/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Action failed");
    }
  }

  async function createCurrency() {
    setCurrencyErr(null);
    try {
      await adminAction("currency.create", {
        code: newCurrencyCode,
        symbol: newCurrencySymbol,
        decimal_places: Number(newCurrencyDecimals || 2),
        display_format: newCurrencyFormat,
      });
      setNewCurrencyCode("");
      setNewCurrencySymbol("");
      setNewCurrencyDecimals("2");
      setNewCurrencyFormat("");
      await loadSettings();
    } catch (e: any) {
      setCurrencyErr(e?.message || "Failed to create currency");
    }
  }

  function startEditCurrency(item: CurrencyItem) {
    setEditingCurrencyId(item.id);
    setEditCurrencySymbol(String(item.symbol || ""));
    setEditCurrencyDecimals(String(item.decimal_places ?? 2));
    setEditCurrencyFormat(String(item.display_format || ""));
  }

  function cancelEditCurrency() {
    setEditingCurrencyId(null);
    setEditCurrencySymbol("");
    setEditCurrencyDecimals("2");
    setEditCurrencyFormat("");
  }

  async function saveCurrencyEdit() {
    if (!editingCurrencyId) return;
    setCurrencyErr(null);
    try {
      await adminAction("currency.update", {
        id: editingCurrencyId,
        symbol: editCurrencySymbol,
        decimal_places: Number(editCurrencyDecimals || 2),
        display_format: editCurrencyFormat,
      });
      cancelEditCurrency();
      await loadSettings();
    } catch (e: any) {
      setCurrencyErr(e?.message || "Failed to update currency");
    }
  }

  async function toggleCurrency(id: number, is_active: number) {
    setCurrencyErr(null);
    try {
      await adminAction("currency.update", { id, is_active });
      await loadSettings();
    } catch (e: any) {
      setCurrencyErr(e?.message || "Failed to update currency");
    }
  }

  async function createCountry() {
    setCountryErr(null);
    try {
      await adminAction("country.create", {
        name: newCountryName,
        iso2: newCountryIso2,
        iso3: newCountryIso3,
        default_currency_id: newCountryDefaultCurrencyId,
        settlement_currency_code: newCountrySettlement,
        payment_provider: newCountryProvider,
      });
      setNewCountryName("");
      setNewCountryIso2("");
      setNewCountryIso3("");
      setNewCountrySettlement("");
      setNewCountryProvider("");
      await loadSettings();
    } catch (e: any) {
      setCountryErr(e?.message || "Failed to create country");
    }
  }

  function startEditCountry(item: CountryItem) {
    setEditingCountryId(item.id);
    setEditCountryName(item.name || "");
    setEditCountryIso2(item.iso2 || "");
    setEditCountryIso3(item.iso3 || "");
    setEditCountryDefaultCurrencyId(item.default_currency_id ?? null);
    setEditCountrySettlement(item.settlement_currency_code || "");
    setEditCountryProvider(item.payment_provider || "");
  }

  function cancelEditCountry() {
    setEditingCountryId(null);
    setEditCountryName("");
    setEditCountryIso2("");
    setEditCountryIso3("");
    setEditCountryDefaultCurrencyId(null);
    setEditCountrySettlement("");
    setEditCountryProvider("");
  }

  async function saveCountryEdit() {
    if (!editingCountryId) return;
    setCountryErr(null);
    try {
      await adminAction("country.update", {
        id: editingCountryId,
        name: editCountryName,
        iso2: editCountryIso2,
        iso3: editCountryIso3,
        default_currency_id: editCountryDefaultCurrencyId,
        settlement_currency_code: editCountrySettlement,
        payment_provider: editCountryProvider,
      });
      cancelEditCountry();
      await loadSettings();
    } catch (e: any) {
      setCountryErr(e?.message || "Failed to update country");
    }
  }

  async function toggleCountry(id: number, is_active: number) {
    setCountryErr(null);
    try {
      await adminAction("country.update", { id, is_active });
      await loadSettings();
    } catch (e: any) {
      setCountryErr(e?.message || "Failed to update country");
    }
  }

  async function createCountryCurrency() {
    setCountryErr(null);
    if (!newCountryCurrencyCountryId || !newCountryCurrencyCurrencyId) {
      setCountryErr("Select a country and a currency.");
      return;
    }
    try {
      await adminAction("country_currency.create", {
        country_id: newCountryCurrencyCountryId,
        currency_id: newCountryCurrencyCurrencyId,
      });
      await loadSettings();
    } catch (e: any) {
      setCountryErr(e?.message || "Failed to add country currency");
    }
  }

  async function toggleCountryCurrency(country_id: number, currency_id: number, is_active: number) {
    setCountryErr(null);
    try {
      await adminAction("country_currency.update", { country_id, currency_id, is_active });
      await loadSettings();
    } catch (e: any) {
      setCountryErr(e?.message || "Failed to update country currency");
    }
  }

  async function createFxRate() {
    setFxErr(null);
    try {
      await adminAction("fx_rate.upsert", {
        base_currency_code: newFxBase,
        quote_currency_code: newFxQuote,
        rate: Number(newFxRate),
      });
      setNewFxBase("");
      setNewFxQuote("");
      setNewFxRate("");
      await loadSettings();
    } catch (e: any) {
      setFxErr(e?.message || "Failed to add FX rate");
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
        test_emails_json: testEmailsText
          .split(/[\n,]/)
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean),
        max_active_claims: Number(maxActiveClaims),
        white_label_trial_days: Number(whiteLabelTrialDays),
        white_label_daily_reveals: Number(whiteLabelDailyReveals),
        white_label_insights_daily_limit: Number(whiteLabelDailyInsights),
        white_label_monthly_price_gbp: whiteLabelMonthlyPriceGbp ? Number(whiteLabelMonthlyPriceGbp) : null,
        white_label_yearly_price_gbp: whiteLabelYearlyPriceGbp ? Number(whiteLabelYearlyPriceGbp) : null,
        white_label_monthly_price_cad: whiteLabelMonthlyPriceCad ? Number(whiteLabelMonthlyPriceCad) : null,
        white_label_yearly_price_cad: whiteLabelYearlyPriceCad ? Number(whiteLabelYearlyPriceCad) : null,
        white_label_subscription_countries: whiteLabelSubscriptionCountries.trim() || null,
        white_label_paypal_product_id: whiteLabelPaypalProductId.trim() || null,
        white_label_paypal_plan_monthly_gbp: whiteLabelPaypalMonthlyGbp.trim() || null,
        white_label_paypal_plan_yearly_gbp: whiteLabelPaypalYearlyGbp.trim() || null,
        white_label_paypal_plan_monthly_cad: whiteLabelPaypalMonthlyCad.trim() || null,
        white_label_paypal_plan_yearly_cad: whiteLabelPaypalYearlyCad.trim() || null,
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

  async function createPaypalPlans() {
    setPaypalPlanErr(null);
    setPaypalPlanMsg(null);
    setPaypalPlanLoading(true);
    try {
      const res = await fetch("/api/internal/settings/paypal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: "LineScout White Label Ideas" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create PayPal plans");
      setPaypalPlanMsg("PayPal plans created and saved.");
      await loadSettings();
    } catch (e: any) {
      setPaypalPlanErr(e?.message || "Failed to create PayPal plans");
    } finally {
      setPaypalPlanLoading(false);
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
    if (!newRateCountryId) {
      setShippingErr("Select a country.");
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
          country_id: newRateCountryId,
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
    setEditingRateCountryId(rate.country_id ?? null);
  }

  function cancelEditRate() {
    setEditingRateId(null);
    setEditRateValue("");
    setEditRateUnit("per_kg");
    setEditingRateCountryId(null);
  }

  async function saveRateEdit() {
    if (!editingRateId) return;
    const rateNum = Number(editRateValue);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setShippingErr("Rate must be a positive USD number.");
      return;
    }
    if (!editingRateCountryId) {
      setShippingErr("Select a country.");
      return;
    }
    setSavingRate(true);
    try {
      const res = await fetch("/api/internal/shipping-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRateId,
          rate_value: rateNum,
          rate_unit: editRateUnit,
          country_id: editingRateCountryId,
        }),
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
    loadWhiteLabelExemptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWhiteLabelExemptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wlExemptionsDebounced]);

  useEffect(() => {
    let active = true;

    async function searchUsers() {
      const q = userQuery.trim();
      if (q.length < 2) {
        if (active) {
          setUserSearch([]);
          setUserSearchErr(null);
        }
        return;
      }

      setUserSearchLoading(true);
      setUserSearchErr(null);
      try {
        const res = await fetch(`/api/internal/admin/app-users/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to search users");
        if (active) setUserSearch((data.items || []) as UserSearchItem[]);
      } catch (e: any) {
        if (active) setUserSearchErr(e?.message || "Failed to search users");
      } finally {
        if (active) setUserSearchLoading(false);
      }
    }

    const t = setTimeout(searchUsers, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [userQuery]);

  const canSubmit = useMemo(() => {
    const nameOk = customerName.trim().length > 0;
    const emailOk = customerEmail.trim().includes("@");
    const statusOk = status.trim().length > 0;
    const sourceOk = paymentSource === "paystack" || paymentSource === "paypal";
    const refOk = paymentRef.trim().length > 0;
    const paypalCurrency = currency.toUpperCase();
    const paypalCurrencyOk =
      paymentSource === "paystack" || paypalCurrency === "GBP" || paypalCurrency === "CAD";

    if (!nameOk || !emailOk || !statusOk || !sourceOk || !paypalCurrencyOk || !refOk) return false;
    if (!selectedUserId) return false;

    if (totalDue.trim()) {
      const td = Number(totalDue);
      if (Number.isNaN(td) || td < 0) return false;
    }

    return true;
  }, [
    customerName,
    customerEmail,
    status,
    totalDue,
    paymentSource,
    currency,
    paymentRef,
    selectedUserId,
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
    const maxClaims = Number(maxActiveClaims);
    const trialDays = Number(whiteLabelTrialDays);
    const dailyReveals = Number(whiteLabelDailyReveals);
    const dailyInsights = Number(whiteLabelDailyInsights);
    const monthlyGbp = whiteLabelMonthlyPriceGbp ? Number(whiteLabelMonthlyPriceGbp) : null;
    const yearlyGbp = whiteLabelYearlyPriceGbp ? Number(whiteLabelYearlyPriceGbp) : null;
    const monthlyCad = whiteLabelMonthlyPriceCad ? Number(whiteLabelMonthlyPriceCad) : null;
    const yearlyCad = whiteLabelYearlyPriceCad ? Number(whiteLabelYearlyPriceCad) : null;
    const testEmails = testEmailsText
      .split(/[\n,]/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
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
    if (!Number.isFinite(maxClaims) || maxClaims < 1 || maxClaims > 100) {
      errors.push("Max active claims must be between 1 and 100.");
    }
    if (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 365) {
      errors.push("White-label trial days must be between 0 and 365.");
    }
    if (!Number.isFinite(dailyReveals) || dailyReveals < 1 || dailyReveals > 5000) {
      errors.push("White-label daily reveals must be between 1 and 5000.");
    }
    if (!Number.isFinite(dailyInsights) || dailyInsights < 1 || dailyInsights > 5000) {
      errors.push("White-label daily insights must be between 1 and 5000.");
    }
    if (monthlyGbp != null && (!Number.isFinite(monthlyGbp) || monthlyGbp < 0)) {
      errors.push("White-label monthly price (GBP) must be 0 or more.");
    }
    if (yearlyGbp != null && (!Number.isFinite(yearlyGbp) || yearlyGbp < 0)) {
      errors.push("White-label yearly price (GBP) must be 0 or more.");
    }
    if (monthlyCad != null && (!Number.isFinite(monthlyCad) || monthlyCad < 0)) {
      errors.push("White-label monthly price (CAD) must be 0 or more.");
    }
    if (yearlyCad != null && (!Number.isFinite(yearlyCad) || yearlyCad < 0)) {
      errors.push("White-label yearly price (CAD) must be 0 or more.");
    }
    if (testEmails.some((email) => !email.includes("@"))) {
      errors.push("Test emails must be valid email addresses.");
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
    testEmailsText,
    maxActiveClaims,
    whiteLabelTrialDays,
    whiteLabelDailyReveals,
    whiteLabelDailyInsights,
    whiteLabelMonthlyPriceGbp,
    whiteLabelYearlyPriceGbp,
    whiteLabelMonthlyPriceCad,
    whiteLabelYearlyPriceCad,
    whiteLabelPaypalMonthlyGbp,
    whiteLabelPaypalYearlyGbp,
    whiteLabelPaypalMonthlyCad,
    whiteLabelPaypalYearlyCad,
  ]);

  const rateReady = useMemo(() => {
    const typeOk = !!newRateTypeId;
    const countryOk = !!newRateCountryId;
    const rate = Number(newRateValue);
    const rateOk = Number.isFinite(rate) && rate > 0;
    const usdOk = Number.isFinite(Number(exchangeUsd)) && Number(exchangeUsd) > 0;
    return typeOk && countryOk && rateOk && usdOk;
  }, [newRateTypeId, newRateCountryId, newRateValue, exchangeUsd]);

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

  function selectUser(u: UserSearchItem) {
    setSelectedUserId(u.id);
    setCustomerName(String(u.customer_name || u.display_name || "").trim());
    setCustomerEmail(String(u.email || "").trim());
    setWhatsApp(String(u.whatsapp_number || "").trim());
    setUserDisplayCurrency(String(u.display_currency_code || "").toUpperCase());
    setCustomerPhone("");
    setUserQuery(`${u.display_name || u.email || ""}`);
    setUserSearch([]);
    setUserSearchErr(null);
  }

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setWhatsApp("");
    setNotes("");
    setStatus("pending");
    setCurrency("NGN");
    setPaymentSource("paystack");
    setUserDisplayCurrency("");
    setPaymentRef("");
    setRouteType("machine_sourcing");
    setTotalDue("");
    setResult(null);
    setUserQuery("");
    setUserSearch([]);
    setUserSearchErr(null);
    setSelectedUserId(null);
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
        route_type: routeType,
        total_due: totalDue.trim() ? Number(totalDue) : null,
        payment_source: paymentSource,
        payment_ref: paymentRef.trim(),
      };
      if (selectedUserId) payload.user_id = selectedUserId;

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
  const wlExemptionsNow = Date.now();

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
              Receives a daily payout summary at 8:00 AM local time.
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="text-sm font-medium text-neutral-300">Test emails to exclude (optional)</label>
            <textarea
              value={testEmailsText}
              onChange={(e) => setTestEmailsText(e.target.value)}
              className="mt-2 min-h-[90px] w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="test1@example.com&#10;test2@example.com"
            />
            <div className="mt-1 text-xs text-neutral-400">
              One email per line (or comma separated). Used for filtering test data in admin views.
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
          <div>
            <label className="text-sm font-medium text-neutral-300">Max active claims (global)</label>
            <input
              value={maxActiveClaims}
              onChange={(e) => setMaxActiveClaims(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="3"
              inputMode="numeric"
            />
            <div className="mt-1 text-xs text-neutral-400">
              Applies when none of an agent’s projects are shipped. Per-agent overrides can change this.
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
              <SearchableSelect
                value={newRateCountryId ? String(newRateCountryId) : ""}
                options={countries.map((c) => ({ value: String(c.id), label: c.name }))}
                onChange={(next) => setNewRateCountryId(Number(next) || null)}
                placeholder="Select country"
              />
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
                        <div className="mt-2">
                          <SearchableSelect
                            value={editingRateCountryId ? String(editingRateCountryId) : ""}
                            options={countries.map((c) => ({ value: String(c.id), label: c.name }))}
                            onChange={(next) => setEditingRateCountryId(Number(next) || null)}
                            placeholder="Select country"
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
                          <div className="text-neutral-500">
                            {r.country_name ? `Country: ${r.country_name}` : "Country: —"}
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

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">White label subscriptions</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Configure trial length, daily reveal limits, and PayPal plan IDs for UK/CAD.
            </p>
          </div>
          <button
            onClick={createPaypalPlans}
            disabled={paypalPlanLoading}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
          >
            {paypalPlanLoading ? "Creating..." : "Create PayPal plans"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Trial & limits</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-400">Trial days</label>
                <input
                  value={whiteLabelTrialDays}
                  onChange={(e) => setWhiteLabelTrialDays(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Daily reveals</label>
                <input
                  value={whiteLabelDailyReveals}
                  onChange={(e) => setWhiteLabelDailyReveals(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Daily insights</label>
                <input
                  value={whiteLabelDailyInsights}
                  onChange={(e) => setWhiteLabelDailyInsights(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="numeric"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-neutral-400">Eligible countries (ISO2)</label>
                <input
                  value={whiteLabelSubscriptionCountries}
                  onChange={(e) => setWhiteLabelSubscriptionCountries(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="GB,CA"
                />
                <p className="mt-2 text-[11px] text-neutral-500">
                  Comma-separated ISO2 codes. Only these countries can see Amazon comparison and subscribe.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Prices (GBP)</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-400">Monthly price</label>
                <input
                  value={whiteLabelMonthlyPriceGbp}
                  onChange={(e) => setWhiteLabelMonthlyPriceGbp(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Yearly price</label>
                <input
                  value={whiteLabelYearlyPriceGbp}
                  onChange={(e) => setWhiteLabelYearlyPriceGbp(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="decimal"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-neutral-400">PayPal plan IDs (GBP)</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={whiteLabelPaypalMonthlyGbp}
                    onChange={(e) => setWhiteLabelPaypalMonthlyGbp(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Monthly plan ID"
                  />
                  <input
                    value={whiteLabelPaypalYearlyGbp}
                    onChange={(e) => setWhiteLabelPaypalYearlyGbp(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Yearly plan ID"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Prices (CAD)</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-neutral-400">Monthly price</label>
                <input
                  value={whiteLabelMonthlyPriceCad}
                  onChange={(e) => setWhiteLabelMonthlyPriceCad(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Yearly price</label>
                <input
                  value={whiteLabelYearlyPriceCad}
                  onChange={(e) => setWhiteLabelYearlyPriceCad(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="decimal"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-neutral-400">PayPal plan IDs (CAD)</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={whiteLabelPaypalMonthlyCad}
                    onChange={(e) => setWhiteLabelPaypalMonthlyCad(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Monthly plan ID"
                  />
                  <input
                    value={whiteLabelPaypalYearlyCad}
                    onChange={(e) => setWhiteLabelPaypalYearlyCad(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Yearly plan ID"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">PayPal product</div>
            <div className="mt-3">
              <label className="text-xs text-neutral-400">Product ID</label>
              <input
                value={whiteLabelPaypalProductId}
                onChange={(e) => setWhiteLabelPaypalProductId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="PayPal product ID"
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              If empty, the helper will create a product and fill this automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">White label exemptions</div>
                <div className="text-xs text-neutral-500">
                  Grant time‑boxed access by email (1–12 months). Use CSV for cohorts.
                </div>
              </div>
              <button
                onClick={downloadWlExemptionsTemplate}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Download template
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <input
                value={wlExemptionsEmail}
                onChange={(e) => setWlExemptionsEmail(e.target.value)}
                placeholder="user@domain.com"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
              <input
                value={wlExemptionsMonths}
                onChange={(e) => setWlExemptionsMonths(e.target.value)}
                placeholder="Months"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
              <input
                value={wlExemptionsNotes}
                onChange={(e) => setWlExemptionsNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
              <button
                onClick={createWhiteLabelExemption}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
              >
                Add
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleWlExemptionsCsvFile(file);
                }}
                className="w-full text-xs text-neutral-300"
              />
              <button
                onClick={uploadWlExemptionsCsv}
                disabled={wlExemptionsCsvUploading}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
              >
                {wlExemptionsCsvUploading ? "Uploading..." : "Upload CSV"}
              </button>
            </div>
            {wlExemptionsCsvName ? (
              <div className="mt-2 text-xs text-neutral-400">Selected: {wlExemptionsCsvName}</div>
            ) : null}
            {wlExemptionsCsvMsg ? (
              <div className="mt-2 text-xs text-neutral-400">{wlExemptionsCsvMsg}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Current exemptions
              </div>
              <input
                value={wlExemptionsSearch}
                onChange={(e) => setWlExemptionsSearch(e.target.value)}
                placeholder="Search by email or notes"
                className="w-full max-w-xs rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
            </div>

            {wlExemptionsErr ? (
              <div className="mt-3 text-xs text-amber-400">{wlExemptionsErr}</div>
            ) : null}
            {wlExemptionsLoading ? (
              <div className="mt-3 text-xs text-neutral-500">Loading exemptions…</div>
            ) : null}

            {!wlExemptionsLoading && !wlExemptions.length ? (
              <div className="mt-3 text-xs text-neutral-500">No exemptions found.</div>
            ) : null}

            <div className="mt-4 grid gap-3">
              {wlExemptions.map((item) => {
                const endsAt = Date.parse(item.ends_at);
                const active =
                  !item.revoked_at && Number.isFinite(endsAt) && endsAt >= wlExemptionsNow;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-neutral-100">{item.email}</div>
                      <div
                        className={`rounded-full px-2 py-1 text-[11px] ${
                          active
                            ? "bg-emerald-900/40 text-emerald-200"
                            : item.revoked_at
                            ? "bg-neutral-800 text-neutral-300"
                            : "bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        {active ? "Active" : item.revoked_at ? "Revoked" : "Expired"}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                      <div>Starts: {new Date(item.starts_at).toLocaleDateString()}</div>
                      <div>Ends: {new Date(item.ends_at).toLocaleDateString()}</div>
                      {item.source ? <div>Source: {item.source}</div> : null}
                    </div>
                    {item.notes ? (
                      <div className="mt-2 text-[11px] text-neutral-400">{item.notes}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {paypalPlanErr ? (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {paypalPlanErr}
          </div>
        ) : null}
        {paypalPlanMsg ? (
          <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            {paypalPlanMsg}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Countries & currencies</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Configure supported markets, display currencies, and FX rates. Settlement currency can be any code.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Currencies</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={newCurrencyCode}
                onChange={(e) => setNewCurrencyCode(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Code (e.g. NGN)"
              />
              <input
                value={newCurrencySymbol}
                onChange={(e) => setNewCurrencySymbol(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Symbol (e.g. ₦)"
              />
              <input
                value={newCurrencyDecimals}
                onChange={(e) => setNewCurrencyDecimals(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Decimals (e.g. 2)"
                inputMode="numeric"
              />
              <input
                value={newCurrencyFormat}
                onChange={(e) => setNewCurrencyFormat(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Format (optional)"
              />
              <button
                onClick={createCurrency}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Add currency
              </button>
            </div>

            {currencyErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                {currencyErr}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {currencies.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                >
                  {editingCurrencyId === c.id ? (
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-neutral-100">{c.code}</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input
                          value={editCurrencySymbol}
                          onChange={(e) => setEditCurrencySymbol(e.target.value)}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Symbol"
                        />
                        <input
                          value={editCurrencyDecimals}
                          onChange={(e) => setEditCurrencyDecimals(e.target.value)}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Decimals"
                        />
                        <input
                          value={editCurrencyFormat}
                          onChange={(e) => setEditCurrencyFormat(e.target.value)}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Format"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={saveCurrencyEdit}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditCurrency}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-semibold text-neutral-100">{c.code}</div>
                        <div className="text-neutral-400">
                          {c.symbol || "—"} · {c.decimal_places ?? 2} decimals
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditCurrency(c)}
                          className="text-xs text-neutral-400 hover:text-neutral-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleCurrency(c.id, c.is_active === 0 ? 1 : 0)}
                          className="text-xs text-neutral-400 hover:text-neutral-100"
                        >
                          {c.is_active === 0 ? "Activate" : "Deactivate"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Countries</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={newCountryName}
                onChange={(e) => setNewCountryName(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Country name"
              />
              <input
                value={newCountryIso2}
                onChange={(e) => setNewCountryIso2(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="ISO2 (e.g. NG)"
              />
              <input
                value={newCountryIso3}
                onChange={(e) => setNewCountryIso3(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="ISO3 (optional)"
              />
              <SearchableSelect
                value={newCountryDefaultCurrencyId ? String(newCountryDefaultCurrencyId) : ""}
                options={[
                  { value: "", label: "Default currency (optional)" },
                  ...currencies.map((c) => ({ value: String(c.id), label: c.code })),
                ]}
                onChange={(next) => setNewCountryDefaultCurrencyId(next ? Number(next) : null)}
              />
              <input
                value={newCountrySettlement}
                onChange={(e) => setNewCountrySettlement(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Settlement currency (e.g. NGN)"
              />
              <input
                value={newCountryProvider}
                onChange={(e) => setNewCountryProvider(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Payment provider (optional)"
              />
              <button
                onClick={createCountry}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Add country
              </button>
            </div>

            {countryErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                {countryErr}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {countries.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                >
                  {editingCountryId === c.id ? (
                    <div className="flex-1">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={editCountryName}
                          onChange={(e) => setEditCountryName(e.target.value)}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Name"
                        />
                        <input
                          value={editCountryIso2}
                          onChange={(e) => setEditCountryIso2(e.target.value.toUpperCase())}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="ISO2"
                        />
                        <input
                          value={editCountryIso3}
                          onChange={(e) => setEditCountryIso3(e.target.value.toUpperCase())}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="ISO3"
                        />
                        <SearchableSelect
                          value={editCountryDefaultCurrencyId ? String(editCountryDefaultCurrencyId) : ""}
                          options={[
                            { value: "", label: "Default currency (optional)" },
                            ...currencies.map((cur) => ({ value: String(cur.id), label: cur.code })),
                          ]}
                          onChange={(next) => setEditCountryDefaultCurrencyId(next ? Number(next) : null)}
                        />
                        <input
                          value={editCountrySettlement}
                          onChange={(e) => setEditCountrySettlement(e.target.value.toUpperCase())}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Settlement currency"
                        />
                        <input
                          value={editCountryProvider}
                          onChange={(e) => setEditCountryProvider(e.target.value)}
                          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          placeholder="Payment provider"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={saveCountryEdit}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditCountry}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-semibold text-neutral-100">
                          {c.name} ({c.iso2})
                        </div>
                        <div className="text-neutral-400">
                          Default: {c.default_currency_code || "—"} · Settlement:{" "}
                          {c.settlement_currency_code || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditCountry(c)}
                          className="text-xs text-neutral-400 hover:text-neutral-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleCountry(c.id, c.is_active === 0 ? 1 : 0)}
                          className="text-xs text-neutral-400 hover:text-neutral-100"
                        >
                          {c.is_active === 0 ? "Activate" : "Deactivate"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Country currencies</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SearchableSelect
                value={newCountryCurrencyCountryId ? String(newCountryCurrencyCountryId) : ""}
                options={[
                  { value: "", label: "Select country" },
                  ...countries.map((c) => ({ value: String(c.id), label: `${c.name} (${c.iso2})` })),
                ]}
                onChange={(next) => setNewCountryCurrencyCountryId(next ? Number(next) : null)}
              />
              <SearchableSelect
                value={newCountryCurrencyCurrencyId ? String(newCountryCurrencyCurrencyId) : ""}
                options={[
                  { value: "", label: "Select currency" },
                  ...currencies.map((c) => ({ value: String(c.id), label: c.code })),
                ]}
                onChange={(next) => setNewCountryCurrencyCurrencyId(next ? Number(next) : null)}
              />
              <button
                onClick={createCountryCurrency}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Add mapping
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {countryCurrencies.map((cc) => (
                <div
                  key={`${cc.country_id}-${cc.currency_id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                >
                  <span>
                    {cc.country_name || "Country"} → {cc.currency_code || "Currency"}
                  </span>
                  <button
                    onClick={() =>
                      toggleCountryCurrency(cc.country_id, cc.currency_id, cc.is_active === 0 ? 1 : 0)
                    }
                    className="text-xs text-neutral-400 hover:text-neutral-100"
                  >
                    {cc.is_active === 0 ? "Activate" : "Deactivate"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">FX rates</div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SearchableSelect
                value={newFxBase}
                onChange={(value) => setNewFxBase(value)}
                options={[
                  { value: "", label: "Select base" },
                  ...currencies.map((c) => ({ value: String(c.code), label: String(c.code) })),
                ]}
                placeholder="Base currency"
                variant="light"
              />
              <SearchableSelect
                value={newFxQuote}
                onChange={(value) => setNewFxQuote(value)}
                options={[
                  { value: "", label: "Select quote" },
                  ...currencies.map((c) => ({ value: String(c.code), label: String(c.code) })),
                ]}
                placeholder="Quote currency"
                variant="light"
              />
              <input
                value={newFxRate}
                onChange={(e) => setNewFxRate(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                placeholder="Rate"
                inputMode="decimal"
              />
              <button
                onClick={createFxRate}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Add FX rate
              </button>
            </div>

            {fxErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                {fxErr}
              </div>
            ) : null}

            <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
              {fxRates.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                >
                  <div>
                    <div className="font-semibold text-neutral-100">
                      {r.base_currency_code} → {r.quote_currency_code}
                    </div>
                    <div className="text-neutral-400">Rate: {Number(r.rate || 0).toLocaleString()}</div>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {r.effective_at ? `Effective ${r.effective_at}` : "No effective date"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manual onboarding card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">Manual onboarding</h3>
            <p className="mt-1 text-sm text-neutral-400">
              For customers who already paid in-app (Paystack or PayPal) but the project did not
              create automatically. This creates the sourcing token (SRC-...) and handoff record,
              and records the commitment payment in history.
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
              Legacy bank list. In-app payments use Paystack/PayPal, so this is no longer used for
              onboarding.
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
                  This will generate a Request ID token, create the project, and record the
                  commitment payment from Paystack or PayPal.
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
                        <p>Conversation ID: {result.conversationId ?? "—"}</p>
                        <p>Status: {result.status}</p>
                        <p>Type: {result.handoff_type}</p>
                        <p>Email: {result.customer_email}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <a
                          href={`/internal/handoffs/${result.handoffId}`}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-neutral-200 hover:border-neutral-500"
                        >
                          View handoff
                        </a>
                        {result.conversationId ? (
                          <a
                            href={`/internal/agent-handoffs/${result.handoffId}`}
                            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-neutral-200 hover:border-neutral-500"
                          >
                            View agent handoff
                          </a>
                        ) : null}
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

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-300">Search user</label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={userQuery}
                      onChange={(e) => {
                        setUserQuery(e.target.value);
                        setSelectedUserId(null);
                        setCustomerName("");
                        setCustomerEmail("");
                        setCustomerPhone("");
                        setWhatsApp("");
                      }}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                      placeholder="Search by name or email"
                      inputMode="search"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUserQuery("");
                        setUserSearch([]);
                        setSelectedUserId(null);
                        setCustomerName("");
                        setCustomerEmail("");
                        setCustomerPhone("");
                        setWhatsApp("");
                      }}
                      className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                    >
                      Clear
                    </button>
                  </div>
                  {userSearchLoading ? (
                    <p className="mt-2 text-xs text-neutral-500">Searching…</p>
                  ) : null}
                  {userSearchErr ? (
                    <p className="mt-2 text-xs text-red-300">{userSearchErr}</p>
                  ) : null}
                  {!userSearchLoading && !userSearchErr && userQuery.trim().length >= 2 ? (
                    <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950">
                      {userSearch.length ? (
                        userSearch.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => selectUser(u)}
                            className="flex w-full items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
                          >
                            <span className="font-medium text-neutral-100">
                              {u.display_name || u.customer_name || "Unnamed user"}
                            </span>
                            <span className="text-xs text-neutral-500">{u.email}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-neutral-500">No users found.</div>
                      )}
                    </div>
                  ) : null}
                  {selectedUserId ? (
                    <p className="mt-2 text-xs text-emerald-300">
                      Selected user ID: {selectedUserId}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      Select a user before creating a handoff.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 disabled:opacity-60"
                    placeholder="e.g. John Doe"
                    disabled
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer email</label>
                  <input
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 disabled:opacity-60"
                    placeholder="e.g. john@example.com"
                    inputMode="email"
                    disabled
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    Customer phone (optional)
                  </label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 disabled:opacity-60"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                    disabled
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    WhatsApp number (optional)
                  </label>
                  <input
                    value={whatsApp}
                    onChange={(e) => setWhatsApp(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600 disabled:opacity-60"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                    disabled
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
                  <label className="text-xs font-medium text-neutral-300">Route type</label>
                  <SearchableSelect
                    className="mt-1"
                    value={routeType}
                    options={[
                      { value: "machine_sourcing", label: "machine_sourcing" },
                      { value: "white_label", label: "white_label" },
                      { value: "simple_sourcing", label: "simple_sourcing" },
                    ]}
                    onChange={(next) => setRouteType(next as any)}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Determines which project flow the customer sees.
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
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="NGN"
                    disabled
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Payment source</label>
                  <SearchableSelect
                    className="mt-1"
                    value={paymentSource}
                    options={[
                      { value: "paystack", label: "Paystack" },
                      { value: "paypal", label: "PayPal" },
                    ]}
                    onChange={(next) => setPaymentSource((next as any) || "paystack")}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Records the commitment payment source in history.
                  </p>
                  {paymentSource === "paypal" && currency && currency !== "GBP" && currency !== "CAD" ? (
                    <p className="mt-1 text-xs text-red-300">
                      PayPal currency must be GBP or CAD for this user.
                    </p>
                  ) : null}
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-300">Payment reference</label>
                  <input
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Paystack reference or PayPal order ID"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Required. Used to reconcile the payment and prevent duplicates.
                  </p>
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
