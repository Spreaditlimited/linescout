"use client";

import { useEffect, useMemo, useState } from "react";

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
  depositEnabled?: boolean;
  depositPercent?: number;
  commitmentDueNgn?: number;
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
  depositEnabled = false,
  depositPercent = 0,
  commitmentDueNgn = 0,
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
  const [paymentOption, setPaymentOption] = useState<"deposit" | "product" | "shipping">("product");
  const [useWallet, setUseWallet] = useState(true);
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
      const token =
        window.localStorage.getItem("linescout_refresh_token") ||
        window.localStorage.getItem("linescout_user_token") ||
        "";
      if (!token) {
        if (!cancelled) setWalletAuthMissing(true);
        return;
      }
      setWalletLoading(true);
      try {
        const res = await fetch("/api/mobile/wallet", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) {
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
  const productTotalDisplay = totals.totalProductNgn + totals.totalMarkupNgn;
  const productPaidTotal = paidTotals.deposit_paid + paidTotals.product_paid;
  const productTarget = Math.max(0, Math.round(productTotalDisplay - commitmentDueNgn));
  const depositAmount = depositEnabled ? Math.round((productTotalDisplay * depositPercent) / 100) : 0;
  const depositRemaining = Math.max(0, depositAmount - paidTotals.deposit_paid);
  const productRemaining = Math.max(0, Math.round(productTarget - productPaidTotal));
  const shippingRemaining = Math.max(0, Math.round(totals.totalShippingNgn - paidTotals.shipping_paid));

  const totalDueNgn = useMemo(() => {
    if (paymentOption === "deposit") return depositRemaining;
    if (paymentOption === "shipping") return shippingRemaining;
    return productRemaining;
  }, [paymentOption, depositRemaining, shippingRemaining, productRemaining]);

  const canPayShipping = productPaidTotal >= productTarget;
  const canPayDeposit = depositEnabled && depositRemaining > 0;
  const canPayProduct = productRemaining > 0;

  const progress = {
    deposit: depositEnabled ? Math.min(1, depositAmount > 0 ? paidTotals.deposit_paid / depositAmount : 0) : null,
    product: productTarget > 0 ? Math.min(1, productPaidTotal / productTarget) : 0,
    shipping: totals.totalShippingNgn > 0 ? Math.min(1, paidTotals.shipping_paid / totals.totalShippingNgn) : 0,
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
      `Amount: ${fmtNaira(providusDetails.amount)}`,
    ].join("\n");
    copyText(content);
  };

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
              {depositEnabled ? (
                <button
                  type="button"
                  onClick={() => setPaymentOption("deposit")}
                  disabled={!canPayDeposit}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    paymentOption === "deposit"
                      ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                      : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                  } ${!canPayDeposit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Pay deposit ({depositPercent || 0}% · {fmtNaira(depositRemaining || 0)})
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPaymentOption("product")}
                disabled={!canPayProduct}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  paymentOption === "product"
                    ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                } ${!canPayProduct ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Pay product ({fmtNaira(productRemaining || 0)})
              </button>
              <button
                type="button"
                onClick={() => setPaymentOption("shipping")}
                disabled={!canPayShipping || shippingRemaining <= 0}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  paymentOption === "shipping"
                    ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                } ${!canPayShipping || shippingRemaining <= 0 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Pay shipping ({fmtNaira(shippingRemaining || 0)})
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Product payment includes local transport. Shipping is available only after product is fully paid.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Payment timeline</div>
            <div className="mt-4 space-y-3 text-sm">
              {depositEnabled ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-neutral-200">Deposit</div>
                    <div className="text-xs text-neutral-400">
                      {fmtNaira(paidTotals.deposit_paid)} / {fmtNaira(depositAmount)}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-neutral-800">
                    <div
                      className="h-2 rounded-full bg-emerald-400"
                      style={{ width: `${Math.round((progress.deposit || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-neutral-200">Product payment</div>
                  <div className="text-xs text-neutral-400">
                    {fmtNaira(productPaidTotal)} / {fmtNaira(productTarget)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-neutral-800">
                  <div
                    className="h-2 rounded-full bg-emerald-400"
                    style={{ width: `${Math.round(progress.product * 100)}%` }}
                  />
                </div>
                {commitmentDueNgn > 0 ? (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Commitment fee discount: {fmtNaira(commitmentDueNgn)}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-neutral-200">Shipping payment</div>
                  <div className="text-xs text-neutral-400">
                    {fmtNaira(paidTotals.shipping_paid)} / {fmtNaira(totals.totalShippingNgn)}
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-neutral-800">
                  <div
                    className="h-2 rounded-full bg-emerald-400"
                    style={{ width: `${Math.round(progress.shipping * 100)}%` }}
                  />
                </div>
                {!canPayShipping ? (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Available after product is fully paid.
                  </div>
                ) : null}
              </div>
            </div>
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
            <div className="text-xs text-neutral-500">Amount due (NGN)</div>
            <div className="text-xl font-semibold text-emerald-200">{fmtNaira(totalDueNgn)}</div>
            {commitmentDueNgn > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                Commitment fee is applied as an instant discount once product is fully paid.
              </p>
            ) : null}
            {paymentOption === "product" && commitmentDueNgn > 0 ? (
              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-400">
                <div className="flex items-center justify-between">
                  <span>Product total (includes markup)</span>
                  <span>{fmtNaira(productTotalDisplay)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Commitment fee discount</span>
                  <span>- {fmtNaira(commitmentDueNgn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-neutral-200">
                  <span>Amount due now</span>
                  <span>{fmtNaira(productRemaining)}</span>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handlePayRemaining}
              className="mt-4 w-full rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500"
            >
              Pay exact remaining balance
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Payment method</div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUseWallet((v) => !v)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  useWallet ? "border-emerald-300 bg-emerald-300/10 text-emerald-200" : "border-neutral-700 text-neutral-300"
                }`}
              >
                {useWallet ? "Wallet + card/bank" : "Card/bank only"}
              </button>
              {walletLoading ? (
                <span className="text-xs text-neutral-500">Loading wallet…</span>
              ) : walletBalance != null ? (
                <span className="text-xs text-neutral-400">
                  Wallet: {walletCurrency || "NGN"} {Math.round(walletBalance).toLocaleString()}
                </span>
              ) : walletAuthMissing ? (
                <span className="text-xs text-neutral-500">Sign in to show wallet balance.</span>
              ) : null}
            </div>
            {walletAccount ? (
              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-300">
                <div className="text-[11px] uppercase text-neutral-500">Wallet funding account</div>
                <div className="mt-1 font-semibold text-neutral-200">
                  {walletAccount.bank_name || "Bank transfer"}
                </div>
                <div className="mt-1">Account name: {walletAccount.account_name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span>Account number: {walletAccount.account_number}</span>
                  <button
                    type="button"
                    onClick={() => copyText(walletAccount.account_number)}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
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
                      className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
                    >
                      NGN {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {payErr ? <div className="mt-3 text-xs text-rose-300">{payErr}</div> : null}
            {payMsg ? <div className="mt-3 text-xs text-emerald-300">{payMsg}</div> : null}

            {providusDetails ? (
              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm">
                <div className="text-xs text-neutral-500">Providus transfer details</div>
                <div className="mt-2 text-base font-semibold text-white">
                  {providusDetails.bank_name}
                </div>
                <div className="mt-2 text-sm text-neutral-300">
                  Account name: {providusDetails.account_name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
                  <span>Account number: {providusDetails.account_number}</span>
                  <button
                    type="button"
                    onClick={() => copyText(providusDetails.account_number)}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-2 text-sm text-emerald-200">
                  Amount: {fmtNaira(providusDetails.amount)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyProvidusAll}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
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
                    className="rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
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
              className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 disabled:opacity-60"
            >
              {paying ? "Processing..." : "Pay now"}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-xs text-neutral-500">Payment history</div>
            {payments.length ? (
              <div className="mt-3 space-y-3 text-sm">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-neutral-200">{formatPurpose(p.purpose)}</div>
                      <div className="text-xs text-neutral-400">
                        {p.status === "paid" ? "Paid" : "Pending"}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-400">
                      {p.currency} {Number(p.amount || 0).toLocaleString()} · {p.method}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      {p.paid_at ? `Paid ${fmtDate(p.paid_at)}` : `Created ${fmtDate(p.created_at)}`}
                    </div>
                    {p.status === "paid" ? (
                      <button
                        type="button"
                        onClick={() => downloadReceipt(p)}
                        className="mt-2 rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
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
            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Wallet activity</div>
              <div className="mt-3 space-y-2 text-sm">
                {walletTransactions.slice(0, 8).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs text-neutral-300">
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
