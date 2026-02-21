"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  agentNote?: string | null;
  items: any[];
  exchangeRmb: number;
  exchangeUsd: number;
  markupPercent: number;
  shippingRates: ShippingRate[];
  defaultShippingTypeId?: number | null;
  depositEnabled?: boolean;
  depositPercent?: number;
  commitmentDueNgn?: number;
  provider?: "paystack" | "providus" | "paypal";
  displayCurrencyCode?: string | null;
  displayFxRate?: number | null;
  shippingFxRate?: number | null;
  productFxRate?: number | null;
};

type QuotePayment = {
  id: number;
  purpose: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  provider_ref?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
};

function fmtCurrency(value: number, currency: string) {
  const code = String(currency || "").toUpperCase() || "NGN";
  if (!Number.isFinite(value)) return `${code} 0`;
  const maxDigits = code === "NGN" ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: maxDigits,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(maxDigits)}`;
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

function fmtDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatPurpose(purpose: string) {
  switch (purpose) {
    case "deposit":
      return "Deposit";
    case "shipping_payment":
      return "Shipping payment";
    case "product_balance":
    case "full_product_payment":
      return "Product payment";
    default:
      return purpose || "Payment";
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

  const totalProductRmbWithLocal = totalProductRmb + totalLocalTransportRmb;
  const totalProductNgn = totalProductRmbWithLocal * exchangeRmb;
  const shippingUnits = shippingUnit === "per_cbm" ? totalCbm : totalWeightKg;
  const totalShippingUsd = shippingUnits * shippingRateUsd;
  const totalShippingNgn = totalShippingUsd * exchangeUsd;
  const totalMarkupNgn = (totalProductNgn * markupPercent) / 100;
  const totalMarkupRmb = (totalProductRmbWithLocal * markupPercent) / 100;
  const totalDueNgn = totalProductNgn + totalShippingNgn + totalMarkupNgn;

  return {
    totalProductRmb,
    totalProductRmbWithLocal,
    totalProductNgn,
    totalWeightKg,
    totalCbm,
    totalShippingUsd,
    totalShippingNgn,
    totalMarkupNgn,
    totalMarkupRmb,
    totalDueNgn,
  };
}

export default function QuoteClient({
  token,
  customerName,
  agentNote,
  items,
  exchangeRmb,
  exchangeUsd,
  markupPercent,
  shippingRates,
  defaultShippingTypeId,
  depositEnabled = false,
  depositPercent = 0,
  commitmentDueNgn = 0,
  provider = "paystack",
  displayCurrencyCode,
  displayFxRate,
  shippingFxRate,
  productFxRate,
}: QuoteClientProps) {
  const rawDisplayCurrency = String(displayCurrencyCode || "NGN").toUpperCase();
  const effectiveDisplayCurrency = rawDisplayCurrency || "NGN";
  const fx = Number(displayFxRate || 0);
  const effectiveDisplayRate = effectiveDisplayCurrency === "NGN" ? 1 : fx;
  const shippingFx = Number(shippingFxRate || 0);
  const productFx = Number(productFxRate || 0);
  const shippingDisplayRate = effectiveDisplayCurrency === "NGN" ? exchangeUsd : shippingFx;
  const searchParams = useSearchParams();
  const showFxDebug = String(searchParams?.get("fxdebug") || "") === "1";
  const initialRateId = useMemo(() => {
    if (!shippingRates.length) return null;
    if (defaultShippingTypeId) {
      const match = shippingRates.find((rate) => rate.shipping_type_id === defaultShippingTypeId);
      if (match) return match.id;
    }
    return shippingRates[0].id;
  }, [shippingRates, defaultShippingTypeId]);

  const [selectedRateId, setSelectedRateId] = useState<number | null>(initialRateId);
  const [paymentOption, setPaymentOption] = useState<"deposit" | "product" | "shipping">("product");
  const [useWallet, setUseWallet] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState<string | null>(null);
  const [walletAccount, setWalletAccount] = useState<{
    account_number: string;
    account_name: string;
    bank_name?: string | null;
    provider?: string | null;
  } | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletAuthMissing, setWalletAuthMissing] = useState(false);
  const [providusDetails, setProvidusDetails] = useState<{
    account_number: string;
    account_name: string;
    bank_name: string;
    note?: string | null;
    amount: number;
  } | null>(null);
  const [providusExpiresAt, setProvidusExpiresAt] = useState<number | null>(null);
  const [providusCountdown, setProvidusCountdown] = useState<string | null>(null);

  const [paidTotals, setPaidTotals] = useState({
    deposit_paid: 0,
    product_paid: 0,
    shipping_paid: 0,
  });
  const [payments, setPayments] = useState<QuotePayment[]>([]);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  useEffect(() => {
    const pay = String(searchParams?.get("pay") || "").toLowerCase();
    if (pay === "shipping") {
      setPaymentOption("shipping");
      setPayMsg("Shipping payment selected.");
    } else if (pay === "deposit") {
      setPaymentOption("deposit");
    }
  }, [searchParams]);

  const refreshPayments = async () => {
    try {
      const res = await fetch(`/api/quote/${token}/payments`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setPaidTotals({
          deposit_paid: Number(json.totals?.deposit_paid || 0),
          product_paid: Number(json.totals?.product_paid || 0),
          shipping_paid: Number(json.totals?.shipping_paid || 0),
        });
        setPayments((json.payments || []) as QuotePayment[]);
        setHandoffStatus(
          typeof json.handoff_status === "string" && json.handoff_status.trim()
            ? json.handoff_status.trim().toLowerCase()
            : null
        );
      }
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    async function loadPayments() {
      await refreshPayments();
      if (cancelled) return;
    }
    loadPayments();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function loadWallet() {
      if (typeof window === "undefined") return;
      setWalletLoading(true);
      try {
        const res = await fetch("/api/mobile/wallet", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) setWalletAuthMissing(true);
          return;
        }
        if (!cancelled && json?.ok) {
          setWalletBalance(Number(json.wallet?.balance || 0));
          setWalletCurrency(String(json.wallet?.currency || "NGN"));
          setWalletAccount(json.virtual_account || null);
          setWalletTransactions(Array.isArray(json.transactions) ? json.transactions : []);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    }
    loadWallet();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUseWallet = walletBalance != null && !walletLoading && !walletAuthMissing;
  const isProvidus = provider === "providus";
  const isPaystack = provider === "paystack";
  const isPaypal = provider === "paypal";

  useEffect(() => {
    if (!canUseWallet && useWallet) {
      setUseWallet(false);
    }
  }, [canUseWallet, useWallet]);

  useEffect(() => {
    if (!isPaystack && useWallet) {
      setUseWallet(false);
    }
  }, [isPaystack, useWallet]);

  useEffect(() => {
    if (!isProvidus && providusDetails) {
      setProvidusDetails(null);
      setProvidusExpiresAt(null);
      setProvidusCountdown(null);
    }
  }, [isProvidus, providusDetails]);

  useEffect(() => {
    if (!providusExpiresAt) {
      setProvidusCountdown(null);
      return;
    }
    const interval = setInterval(() => {
      const ms = providusExpiresAt - Date.now();
      if (ms <= 0) {
        setProvidusCountdown("Expired");
        return;
      }
      const totalMinutes = Math.floor(ms / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setProvidusCountdown(`${hours}h ${minutes}m remaining`);
    }, 1000 * 30);
    return () => clearInterval(interval);
  }, [providusExpiresAt]);

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
  const productTotalNgn = totals.totalProductNgn + totals.totalMarkupNgn;
  const productPaidTotalNgn = paidTotals.deposit_paid + paidTotals.product_paid;
  const productTargetNgn = Math.max(0, Math.round(productTotalNgn - commitmentDueNgn));
  const depositAmountNgn = depositEnabled ? Math.round((productTotalNgn * depositPercent) / 100) : 0;
  const depositRemainingNgn = Math.max(0, depositAmountNgn - paidTotals.deposit_paid);
  const productRemainingNgn = Math.max(0, Math.round(productTargetNgn - productPaidTotalNgn));
  const shippingRemainingNgn = Math.max(0, Math.round(totals.totalShippingNgn - paidTotals.shipping_paid));

  const paymentDisplayTotals = useMemo(() => {
    const convert = (amount: number, currency: string) => {
      const code = String(currency || "").toUpperCase();
      if (!amount || !Number.isFinite(amount)) return 0;
      if (code === effectiveDisplayCurrency) return amount;
      if (code === "NGN") return amount * effectiveDisplayRate;
      if (code === "USD") {
        if (effectiveDisplayCurrency === "USD") return amount;
        if (shippingFx > 0) return amount * shippingFx;
      }
      return 0;
    };

    const totals = { deposit: 0, product: 0, shipping: 0 };
    for (const p of payments) {
      if (p.status !== "paid") continue;
      const amt = convert(Number(p.amount || 0), p.currency || "NGN");
      if (!amt) continue;
      if (p.purpose === "deposit") totals.deposit += amt;
      else if (p.purpose === "shipping_payment") totals.shipping += amt;
      else if (p.purpose === "product_balance" || p.purpose === "full_product_payment") totals.product += amt;
    }
    return totals;
  }, [payments, effectiveDisplayCurrency, effectiveDisplayRate, shippingFx]);

  const productTotalDisplay =
    effectiveDisplayCurrency === "NGN"
      ? productTotalNgn
      : (totals.totalProductRmbWithLocal + totals.totalMarkupRmb) * productFx;
  const productTargetDisplay =
    effectiveDisplayCurrency === "NGN"
      ? productTargetNgn
      : Math.max(0, productTotalDisplay - commitmentDueNgn * effectiveDisplayRate);
  const depositAmountDisplay =
    effectiveDisplayCurrency === "NGN" ? depositAmountNgn : depositAmountNgn * effectiveDisplayRate;
  const productPaidTotalDisplay =
    effectiveDisplayCurrency === "NGN"
      ? productPaidTotalNgn * effectiveDisplayRate
      : paymentDisplayTotals.product;
  const depositPaidDisplay =
    effectiveDisplayCurrency === "NGN"
      ? paidTotals.deposit_paid * effectiveDisplayRate
      : paymentDisplayTotals.deposit;
  const shippingPaidDisplay =
    effectiveDisplayCurrency === "NGN"
      ? paidTotals.shipping_paid * effectiveDisplayRate
      : paymentDisplayTotals.shipping;
  const depositRemainingDisplay = Math.max(0, depositAmountDisplay - depositPaidDisplay);
  const productRemainingDisplay = Math.max(0, productTargetDisplay - productPaidTotalDisplay);
  const shippingTotalDisplay = totals.totalShippingUsd * shippingDisplayRate;
  const shippingRemainingDisplay = Math.max(0, shippingTotalDisplay - shippingPaidDisplay);

  const totalDueNgn = useMemo(() => {
    if (paymentOption === "deposit") return depositRemainingNgn;
    if (paymentOption === "shipping") return shippingRemainingNgn;
    return productRemainingNgn;
  }, [paymentOption, depositRemainingNgn, shippingRemainingNgn, productRemainingNgn]);

  const totalDueDisplay =
    paymentOption === "deposit"
      ? depositRemainingDisplay
      : paymentOption === "shipping"
      ? shippingRemainingDisplay
      : productRemainingDisplay;

  const hasShippingRemaining =
    effectiveDisplayCurrency === "NGN" ? shippingRemainingNgn > 0 : shippingRemainingDisplay > 0;

  const canPayShipping =
    (effectiveDisplayCurrency === "NGN"
      ? productPaidTotalNgn >= productTargetNgn
      : productPaidTotalDisplay >= productTargetDisplay) && handoffStatus === "shipped";
  const canPayDeposit =
    depositEnabled &&
    (effectiveDisplayCurrency === "NGN" ? depositRemainingNgn > 0 : depositRemainingDisplay > 0);
  const canPayProduct =
    effectiveDisplayCurrency === "NGN" ? productRemainingNgn > 0 : productRemainingDisplay > 0;

  const progress = {
    deposit: depositEnabled
      ? Math.min(1, depositAmountDisplay > 0 ? depositPaidDisplay / depositAmountDisplay : 0)
      : null,
    product: productTargetDisplay > 0 ? Math.min(1, productPaidTotalDisplay / productTargetDisplay) : 0,
    shipping: shippingTotalDisplay > 0 ? Math.min(1, shippingPaidDisplay / shippingTotalDisplay) : 0,
  };

  const handlePay = async () => {
    setPayErr(null);
    setPayMsg(null);
    setProvidusDetails(null);
    if (totalDueNgn <= 0) {
      setPayErr("Nothing due for this payment.");
      return;
    }
    setPaying(true);
    try {
      const res = await fetch(`/api/quote/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: paymentOption === "deposit" ? "deposit" : paymentOption === "shipping" ? "shipping_payment" : "full_product_payment",
          use_wallet: useWallet,
          shipping_type_id: selectedRate?.shipping_type_id || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setPayErr(json?.error || `Payment failed (${res.status})`);
        return;
      }
      if (json.authorization_url) {
        window.location.href = json.authorization_url;
        return;
      }
      if (json.approval_url) {
        window.location.href = json.approval_url;
        return;
      }
      if (json.provider === "providus" && json.account_number) {
        setProvidusDetails({
          account_number: String(json.account_number),
          account_name: String(json.account_name || ""),
          bank_name: String(json.bank_name || "Providus Bank"),
          note: String(json.note || ""),
          amount: Number(json.remaining || totalDueNgn),
        });
        setProvidusExpiresAt(Date.now() + 24 * 60 * 60 * 1000);
        setPayMsg("Transfer to the account below to complete payment.");
        return;
      }
      setPayMsg("Payment completed.");
      await refreshPayments();
    } catch (e: any) {
      setPayErr(e?.message || "Payment failed.");
    } finally {
      setPaying(false);
    }
  };

  const copyText = async (value: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setPayMsg("Copied to clipboard.");
        return;
      }
    } catch {}
    setPayMsg("Copy not supported on this device.");
  };

  const handlePayRemaining = () => {
    if (canPayDeposit) {
      setPaymentOption("deposit");
    } else if (canPayProduct) {
      setPaymentOption("product");
    } else if (canPayShipping) {
      setPaymentOption("shipping");
    }
    setPayMsg("Ready to pay the remaining balance.");
  };

  const downloadReceipt = (payment: QuotePayment) => {
    const lines = [
      "LineScout (Sure Importers Limited)",
      "",
      "Payment receipt",
      `Date: ${fmtDate(payment.paid_at || payment.created_at)}`,
      `Amount: ${payment.currency} ${Number(payment.amount || 0).toLocaleString()}`,
      `Purpose: ${formatPurpose(payment.purpose)}`,
      `Method: ${payment.method || "unknown"}`,
      payment.provider_ref ? `Reference: ${payment.provider_ref}` : "",
      "",
      "Need help? hello@sureimports.com",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linescout-receipt-${payment.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyProvidusAll = () => {
    if (!providusDetails) return;
    const content = [
      `Bank: ${providusDetails.bank_name}`,
      `Account name: ${providusDetails.account_name}`,
      `Account number: ${providusDetails.account_number}`,
      `Amount: ${fmtCurrency(providusDetails.amount, "NGN")}`,
    ].join("\n");
    copyText(content);
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] text-neutral-900" style={{ ["--agent-blue" as any]: "#2D3461" }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Quote</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Customer: <span className="text-neutral-800">{customerName || "Customer"}</span>
              </p>
              <p className="text-xs text-neutral-500">Token: {token}</p>
              {String(agentNote || "").trim() ? (
                <p className="mt-2 whitespace-pre-line text-xs text-neutral-600">
                  Note: <span className="text-neutral-800">{String(agentNote || "").trim()}</span>
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-600">Total due</div>
              <div className="text-2xl font-semibold text-[var(--agent-blue)]">
                {fmtCurrency(totalDueDisplay, effectiveDisplayCurrency)}
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-[rgba(45,52,97,0.14)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[rgba(45,52,97,0.08)] text-neutral-700">
                <tr>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Qty</th>
                  <th className="px-4 py-3 text-left">Unit RMB</th>
                  <th className="px-4 py-3 text-left">Total RMB</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr key={`${idx}`} className="border-t border-[rgba(45,52,97,0.14)]">
                    <td className="px-4 py-3 text-neutral-800">{item.product_name}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.unit_price_rmb}</td>
                    <td className="px-4 py-3 text-neutral-800">
                      {Number(item.quantity || 0) * Number(item.unit_price_rmb || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
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
                        ? "border-[var(--agent-blue)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                        : "border-[rgba(45,52,97,0.2)] text-neutral-700 hover:border-neutral-500"
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

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
            <div className="text-xs text-neutral-500">Payment option</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {depositEnabled ? (
                <button
                  type="button"
                  onClick={() => setPaymentOption("deposit")}
                  disabled={!canPayDeposit}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    paymentOption === "deposit"
                      ? "border-[var(--agent-blue)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                      : "border-[rgba(45,52,97,0.2)] text-neutral-700 hover:border-neutral-500"
                  } ${!canPayDeposit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Pay deposit ({depositPercent || 0}% · {fmtCurrency(depositRemainingDisplay || 0, effectiveDisplayCurrency)})
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPaymentOption("product")}
                disabled={!canPayProduct}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  paymentOption === "product"
                    ? "border-[var(--agent-blue)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                    : "border-[rgba(45,52,97,0.2)] text-neutral-700 hover:border-neutral-500"
                } ${!canPayProduct ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Pay product ({fmtCurrency(productRemainingDisplay || 0, effectiveDisplayCurrency)})
              </button>
              <button
                type="button"
                onClick={() => setPaymentOption("shipping")}
                disabled={!canPayShipping || !hasShippingRemaining}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  paymentOption === "shipping"
                    ? "border-[var(--agent-blue)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                    : "border-[rgba(45,52,97,0.2)] text-neutral-700 hover:border-neutral-500"
                } ${!canPayShipping || !hasShippingRemaining ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Pay shipping ({fmtCurrency(shippingRemainingDisplay || 0, effectiveDisplayCurrency)})
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Product payment includes local transport. Shipping is available only after product is fully paid.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
            <div className="text-xs text-neutral-500">Payment timeline</div>
            <div className="mt-4 space-y-3 text-sm">
              {depositEnabled ? (
                <div className="rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-neutral-800">Deposit</div>
                    <div className="text-xs text-neutral-600">
                    {fmtCurrency(depositPaidDisplay, effectiveDisplayCurrency)} /{" "}
                      {fmtCurrency(depositAmountDisplay, effectiveDisplayCurrency)}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-[rgba(45,52,97,0.12)]">
                    <div
                      className="h-2 rounded-full bg-[var(--agent-blue)]"
                      style={{ width: `${Math.round((progress.deposit || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-neutral-800">Product payment</div>
                  <div className="text-xs text-neutral-600">
                    {fmtCurrency(productPaidTotalDisplay, effectiveDisplayCurrency)} /{" "}
                    {fmtCurrency(productTargetDisplay, effectiveDisplayCurrency)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-[rgba(45,52,97,0.12)]">
                  <div
                    className="h-2 rounded-full bg-[var(--agent-blue)]"
                    style={{ width: `${Math.round(progress.product * 100)}%` }}
                  />
                </div>
                {commitmentDueNgn > 0 ? (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Commitment fee discount: {fmtCurrency(commitmentDueNgn * effectiveDisplayRate, effectiveDisplayCurrency)}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-neutral-800">Shipping payment</div>
                  <div className="text-xs text-neutral-600">
                    {fmtCurrency(shippingPaidDisplay, effectiveDisplayCurrency)} /{" "}
                    {fmtCurrency(shippingTotalDisplay, effectiveDisplayCurrency)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-[rgba(45,52,97,0.12)]">
                  <div
                    className="h-2 rounded-full bg-[var(--agent-blue)]"
                    style={{ width: `${Math.round(progress.shipping * 100)}%` }}
                  />
                </div>
                {!canPayShipping ? (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Available after product is fully paid and the project is marked shipped.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
              <div className="text-xs text-neutral-500">Product total ({effectiveDisplayCurrency})</div>
              <div className="text-lg font-semibold">{fmtCurrency(productTotalDisplay, effectiveDisplayCurrency)}</div>
            </div>
            <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
              <div className="text-xs text-neutral-500">Shipping (USD)</div>
              <div className="text-lg font-semibold">{fmtUsd(totals.totalShippingUsd)}</div>
            </div>
            <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
              <div className="text-xs text-neutral-500">Shipping ({effectiveDisplayCurrency})</div>
              <div className="text-lg font-semibold">{fmtCurrency(shippingTotalDisplay, effectiveDisplayCurrency)}</div>
            </div>
          </div>
          {showFxDebug ? (
            <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3 text-[11px] text-neutral-700">
              <div className="font-semibold text-neutral-800">FX debug</div>
              <div className="mt-1 flex flex-wrap gap-3">
                <span>Display: {effectiveDisplayCurrency}</span>
                <span>NGN→{effectiveDisplayCurrency}: {fx || 0}</span>
                <span>USD→{effectiveDisplayCurrency}: {shippingFx || 0}</span>
                <span>RMB→{effectiveDisplayCurrency}: {productFx || 0}</span>
                <span>USD→NGN: {exchangeUsd || 0}</span>
                <span>RMB→NGN: {exchangeRmb || 0}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
            <div className="text-xs text-neutral-500">Amount due ({effectiveDisplayCurrency})</div>
            <div className="text-xl font-semibold text-[var(--agent-blue)]">
              {fmtCurrency(totalDueDisplay, effectiveDisplayCurrency)}
            </div>
            {commitmentDueNgn > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                Commitment fee is applied as an instant discount once product is fully paid.
              </p>
            ) : null}
            {paymentOption === "product" && commitmentDueNgn > 0 ? (
              <div className="mt-3 rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3 text-xs text-neutral-600">
                <div className="flex items-center justify-between">
                  <span>Product total</span>
                  <span>{fmtCurrency(productTotalDisplay, effectiveDisplayCurrency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Commitment fee discount</span>
                  <span>- {fmtCurrency(commitmentDueNgn * effectiveDisplayRate, effectiveDisplayCurrency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-neutral-800">
                  <span>Amount due now</span>
                  <span>{fmtCurrency(productRemainingDisplay, effectiveDisplayCurrency)}</span>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handlePayRemaining}
              className="mt-4 w-full rounded-xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-neutral-800 hover:border-neutral-500"
            >
              Pay exact remaining balance
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
            <div className="text-xs text-neutral-500">Payment method</div>
            {isPaypal ? (
              <div className="mt-3 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">PayPal</div>
                    <div className="mt-1 text-xs text-neutral-600">Secure card or PayPal balance payment.</div>
                  </div>
                  <img
                    src="/PayPal.png"
                    alt="PayPal"
                    className="h-6 w-auto"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className={`mt-3 grid gap-3 ${isProvidus ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {isPaystack ? (
                    <button
                      type="button"
                      onClick={() => setUseWallet(false)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        !useWallet
                          ? "border-[rgba(45,52,97,0.6)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                          : "border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] text-neutral-800"
                      }`}
                    >
                      <div className="text-sm font-semibold">Card/bank</div>
                      <div className="mt-1 text-xs text-neutral-600">Pay with debit card or bank transfer.</div>
                      <div className="mt-3 flex items-center gap-2">
                        {["VISA", "Mastercard", "Verve"].map((brand) => (
                          <span
                            key={brand}
                            className="rounded-full border border-[rgba(45,52,97,0.2)] px-2.5 py-1 text-[10px] font-semibold uppercase text-neutral-700"
                          >
                            {brand}
                          </span>
                        ))}
                      </div>
                    </button>
                  ) : null}

                  {isProvidus ? (
                    <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-left">
                      <div className="text-sm font-semibold text-neutral-900">Bank transfer (Providus)</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Click Pay now to generate a dedicated Providus account for this payment.
                      </div>
                    </div>
                  ) : null}

                  {isPaystack ? (
                    <button
                      type="button"
                      onClick={() => canUseWallet && setUseWallet(true)}
                      disabled={!canUseWallet}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        useWallet
                          ? "border-[rgba(45,52,97,0.6)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                          : "border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] text-neutral-800"
                      } ${!canUseWallet ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <div className="text-sm font-semibold">Wallet + card/bank</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Use wallet balance first, then complete the rest.
                      </div>
                      {walletLoading ? (
                        <div className="mt-3 text-xs text-neutral-500">Loading wallet…</div>
                      ) : walletBalance != null ? (
                        <div className="mt-3 text-xs text-neutral-700">
                          Wallet: {walletCurrency || "NGN"} {Math.round(walletBalance).toLocaleString()}
                        </div>
                      ) : null}
                    </button>
                  ) : null}
                </div>

                {isPaystack && walletAuthMissing ? (
                  <div className="mt-3 rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.08)] px-3 py-2 text-xs text-neutral-600">
                    To use wallet, ensure you are signed into your LineScout account. If you are not signed in, sign in and then refresh this page.
                  </div>
                ) : null}
                {isPaystack && walletAccount ? (
                  <div className="mt-3 rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3 text-xs text-neutral-700">
                    <div className="text-[11px] uppercase text-neutral-500">Wallet funding account</div>
                    <div className="mt-1 font-semibold text-neutral-800">
                      {walletAccount.bank_name || "Bank transfer"}
                    </div>
                    <div className="mt-1">Account name: {walletAccount.account_name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span>Account number: {walletAccount.account_number}</span>
                      <button
                        type="button"
                        onClick={() => copyText(walletAccount.account_number)}
                        className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="mt-3 text-[11px] text-neutral-500">Top up wallet</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[50000, 100000, 250000, 500000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => copyText(String(amt))}
                          className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                        >
                          NGN {amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {payErr ? <div className="mt-3 text-xs text-red-600">{payErr}</div> : null}
            {payMsg ? <div className="mt-3 text-xs text-[var(--agent-blue)]">{payMsg}</div> : null}

            {isProvidus && providusDetails ? (
              <div className="mt-4 rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.08)] p-4 text-sm">
                <div className="text-xs text-neutral-500">Providus transfer details</div>
                <div className="mt-2 text-base font-semibold text-neutral-900">
                  {providusDetails.bank_name}
                </div>
                <div className="mt-2 text-sm text-neutral-700">
                  Account name: {providusDetails.account_name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                  <span>Account number: {providusDetails.account_number}</span>
                  <button
                    type="button"
                    onClick={() => copyText(providusDetails.account_number)}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-2 text-sm text-[var(--agent-blue)]">
                  Amount: {fmtCurrency(providusDetails.amount, "NGN")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyProvidusAll}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                  >
                    Copy all details
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setPayMsg("Checking for payment...");
                      await refreshPayments();
                      setPayMsg("If your transfer is confirmed, it will reflect here shortly.");
                    }}
                    className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                  >
                    I&apos;ve paid
                  </button>
                  {providusCountdown ? <span className="text-[11px] text-neutral-500">{providusCountdown}</span> : null}
                </div>
                {providusDetails.note ? (
                  <div className="mt-2 text-xs text-neutral-500">{providusDetails.note}</div>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handlePay}
              disabled={paying || totalDueNgn <= 0}
              className="btn btn-primary mt-4 w-full rounded-xl px-4 py-3 text-sm disabled:opacity-60"
            >
              {paying ? "Processing..." : "Pay now"}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
            <div className="text-xs text-neutral-500">Payment history</div>
            {payments.length ? (
              <div className="mt-3 space-y-3 text-sm">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-neutral-800">{formatPurpose(p.purpose)}</div>
                      <div className="text-xs text-neutral-600">
                        {p.status === "paid" ? "Paid" : "Pending"}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-600">
                      {p.currency} {Number(p.amount || 0).toLocaleString()} · {p.method}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      {p.paid_at ? `Paid ${fmtDate(p.paid_at)}` : `Created ${fmtDate(p.created_at)}`}
                    </div>
                    {p.status !== "paid" && p.method === "paystack" && p.provider_ref && isPaystack ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
                        <span>Reference: {p.provider_ref}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/quote/paystack/verify", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ reference: p.provider_ref }),
                              });
                              const json = await res.json().catch(() => null);
                              if (!res.ok || !json?.ok) {
                                setPayErr(json?.error || "Verification failed.");
                                return;
                              }
                              setPayMsg("Payment verified.");
                              await refreshPayments();
                            } catch (e: any) {
                              setPayErr(e?.message || "Verification failed.");
                            }
                          }}
                          className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                        >
                          Verify payment
                        </button>
                      </div>
                    ) : null}
                    {p.status !== "paid" && p.method === "paypal" && p.provider_ref ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
                        <span>Order: {p.provider_ref}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/quote/paypal/verify", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ order_id: p.provider_ref }),
                              });
                              const json = await res.json().catch(() => null);
                              if (!res.ok || !json?.ok) {
                                setPayErr(json?.error || "Verification failed.");
                                return;
                              }
                              setPayMsg("Payment verified.");
                              await refreshPayments();
                            } catch (e: any) {
                              setPayErr(e?.message || "Verification failed.");
                            }
                          }}
                          className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                        >
                          Verify payment
                        </button>
                      </div>
                    ) : null}
                    {p.status === "paid" ? (
                      <button
                        type="button"
                        onClick={() => downloadReceipt(p)}
                        className="mt-2 rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:border-neutral-500"
                      >
                        Download receipt
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">No payments recorded yet.</p>
            )}
          </div>

          {walletTransactions.length ? (
            <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
              <div className="text-xs text-neutral-500">Wallet activity</div>
              <div className="mt-3 space-y-2 text-sm">
                {walletTransactions.slice(0, 8).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs text-neutral-700">
                    <span>
                      {tx.type === "debit" ? "Debit" : "Credit"} · {tx.reason || "Wallet"}
                    </span>
                    <span>
                      {tx.currency || "NGN"} {Number(tx.amount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
