"use client";

import { useEffect, useMemo, useState } from "react";

type QuoteRow = {
  id: number;
  token: string;
  created_at: string;
  country: string;
  total_product_ngn: number;
  total_markup_ngn: number;
  total_addons_ngn: number;
  total_vat_ngn: number;
  total_due_ngn: number;
  vat_rate_percent: number;
  payment_status?: string;
};

type VatRow = {
  country: string;
  vat_rate_percent: number;
  quote_count: number;
  service_charge_ngn: number;
  addons_ngn: number;
  vat_ngn: number;
};

type AddonRow = {
  title: string;
  total_ngn: number;
  line_count: number;
  currency_breakdown: string;
};

type ShippingRow = {
  id: number;
  token: string;
  created_at: string;
  country: string;
  total_due_ngn: number;
  total_paid: number;
  payment_status?: string;
};

type PaymentRow = {
  id: number;
  quote_id: number;
  quote_token?: string | null;
  purpose: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
};

type Pagination = {
  page: number;
  page_size: number;
  total: number;
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

function csvDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function displayStatus(value?: string | null) {
  if (!value) return "-";
  if (value === "partial") return "pending";
  return value;
}

export default function AccountingPage() {
  const [tab, setTab] = useState<"quotes" | "vat" | "addons" | "shipping" | "payments">("quotes");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [quotePagination, setQuotePagination] = useState<Pagination | null>(null);
  const [vatRows, setVatRows] = useState<VatRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [addonPagination, setAddonPagination] = useState<Pagination | null>(null);
  const [shippingRows, setShippingRows] = useState<ShippingRow[]>([]);
  const [shippingPagination, setShippingPagination] = useState<Pagination | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentPagination, setPaymentPagination] = useState<Pagination | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (sort) params.set("sort", sort);
    if (statusFilter) params.set("status", statusFilter);
    return params;
  }, [fromDate, toDate, sort, statusFilter]);

  const loadQuotes = async (page = 1) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams(queryParams);
      params.set("type", "quotes");
      params.set("page", String(page));
      params.set("page_size", "20");
      const res = await fetch(`/api/internal/accounting?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load quotes");
      setQuotes(Array.isArray(json.rows) ? json.rows : []);
      setQuotePagination(json.pagination || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  const loadVat = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams(queryParams);
      params.set("type", "vat");
      const res = await fetch(`/api/internal/accounting?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load VAT ledger");
      setVatRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load VAT ledger");
    } finally {
      setLoading(false);
    }
  };

  const loadAddons = async (page = 1) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams(queryParams);
      params.set("type", "addons");
      params.set("page", String(page));
      params.set("page_size", "20");
      const res = await fetch(`/api/internal/accounting?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load add-ons report");
      setAddons(Array.isArray(json.rows) ? json.rows : []);
      setAddonPagination(json.pagination || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load add-ons report");
    } finally {
      setLoading(false);
    }
  };

  const loadShipping = async (page = 1) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams(queryParams);
      params.set("type", "shipping");
      params.set("page", String(page));
      params.set("page_size", "20");
      const res = await fetch(`/api/internal/accounting?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load shipping quotes");
      setShippingRows(Array.isArray(json.rows) ? json.rows : []);
      setShippingPagination(json.pagination || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load shipping quotes");
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async (page = 1) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams(queryParams);
      params.set("type", "payments");
      params.set("page", String(page));
      params.set("page_size", "20");
      const res = await fetch(`/api/internal/accounting?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load payments");
      setPayments(Array.isArray(json.rows) ? json.rows : []);
      setPaymentPagination(json.pagination || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "quotes") loadQuotes(1);
    if (tab === "vat") loadVat();
    if (tab === "addons") loadAddons(1);
    if (tab === "shipping") loadShipping(1);
    if (tab === "payments") loadPayments(1);
  }, [tab, queryParams]);

  useEffect(() => {
    if (tab === "vat" || tab === "addons" || tab === "payments") {
      setStatusFilter("");
    }
  }, [tab]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams(queryParams);
    params.set("type", tab);
    params.set("export", "1");
    return `/api/internal/accounting?${params.toString()}`;
  }, [queryParams, tab]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Accounting</h2>
            <p className="mt-1 text-sm text-neutral-400">Quote totals, VAT ledger, add-ons revenue, shipping quotes, and payments.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["quotes", "vat", "addons", "shipping", "payments"] as const).map((key) => {
            const label =
              key === "quotes"
                ? "Quote breakdown"
                : key === "vat"
                ? "VAT ledger"
                : key === "addons"
                ? "Add-ons revenue"
                : key === "shipping"
                ? "Shipping quotes"
                : "Payments";
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                  active ? "border-neutral-200 bg-neutral-100 text-neutral-900" : "border-neutral-800 text-neutral-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-xs text-neutral-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Sort by date</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value === "asc" ? "asc" : "desc")}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Payment status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              disabled={tab === "vat" || tab === "addons" || tab === "payments"}
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Pending</option>
            </select>
          </div>
          <div className="flex items-end">
            <a
              href={exportUrl}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-white"
            >
              Export CSV
            </a>
          </div>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-200">
          Loading…
        </div>
      ) : null}

      {tab === "quotes" && !loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-100">Quote breakdown</div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Quote</th>
                  <th className="px-3 py-2 text-left">Country</th>
                  <th className="px-3 py-2 text-right">Product</th>
                  <th className="px-3 py-2 text-right">Service charge</th>
                  <th className="px-3 py-2 text-right">Add-ons</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Total due</th>
                  <th className="px-3 py-2 text-right">Payment status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-900/60 text-neutral-200">
                    <td className="px-3 py-2">{csvDate(row.created_at)}</td>
                    <td className="px-3 py-2">{row.token}</td>
                    <td className="px-3 py-2">{row.country}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_product_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_markup_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_addons_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_vat_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_due_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right capitalize">{displayStatus(row.payment_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {quotePagination ? (
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                Page {quotePagination.page} of {Math.max(1, Math.ceil(quotePagination.total / quotePagination.page_size))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadQuotes(Math.max(1, quotePagination.page - 1))}
                  disabled={quotePagination.page <= 1}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadQuotes(
                      Math.min(
                        Math.max(1, Math.ceil(quotePagination.total / quotePagination.page_size)),
                        quotePagination.page + 1
                      )
                    )
                  }
                  disabled={quotePagination.page >= Math.ceil(quotePagination.total / quotePagination.page_size)}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "vat" && !loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-100">VAT ledger</div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Country</th>
                  <th className="px-3 py-2 text-right">VAT rate</th>
                  <th className="px-3 py-2 text-right">Quotes</th>
                  <th className="px-3 py-2 text-right">Service charge</th>
                  <th className="px-3 py-2 text-right">Add-ons</th>
                  <th className="px-3 py-2 text-right">VAT due</th>
                </tr>
              </thead>
              <tbody>
                {vatRows.map((row, idx) => (
                  <tr key={`${row.country}-${idx}`} className="border-t border-neutral-900/60 text-neutral-200">
                    <td className="px-3 py-2">{row.country}</td>
                    <td className="px-3 py-2 text-right">{Number(row.vat_rate_percent || 0).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right">{Number(row.quote_count || 0)}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.service_charge_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.addons_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.vat_ngn || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "addons" && !loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-100">Add-ons revenue</div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Add-on</th>
                  <th className="px-3 py-2 text-right">Total (NGN)</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2 text-left">Currency breakdown</th>
                </tr>
              </thead>
              <tbody>
                {addons.map((row) => (
                  <tr key={row.title} className="border-t border-neutral-900/60 text-neutral-200">
                    <td className="px-3 py-2">{row.title}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{Number(row.line_count || 0)}</td>
                    <td className="px-3 py-2 text-neutral-400">{row.currency_breakdown}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {addonPagination ? (
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                Page {addonPagination.page} of {Math.max(1, Math.ceil(addonPagination.total / addonPagination.page_size))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadAddons(Math.max(1, addonPagination.page - 1))}
                  disabled={addonPagination.page <= 1}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadAddons(
                      Math.min(
                        Math.max(1, Math.ceil(addonPagination.total / addonPagination.page_size)),
                        addonPagination.page + 1
                      )
                    )
                  }
                  disabled={addonPagination.page >= Math.ceil(addonPagination.total / addonPagination.page_size)}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "shipping" && !loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-100">Shipping quotes</div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Quote</th>
                  <th className="px-3 py-2 text-left">Country</th>
                  <th className="px-3 py-2 text-right">Total due</th>
                  <th className="px-3 py-2 text-right">Total paid</th>
                  <th className="px-3 py-2 text-right">Payment status</th>
                </tr>
              </thead>
              <tbody>
                {shippingRows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-900/60 text-neutral-200">
                    <td className="px-3 py-2">{csvDate(row.created_at)}</td>
                    <td className="px-3 py-2">{row.token}</td>
                    <td className="px-3 py-2">{row.country}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_due_ngn || 0))}</td>
                    <td className="px-3 py-2 text-right">{fmtNaira(Number(row.total_paid || 0))}</td>
                    <td className="px-3 py-2 text-right capitalize">{displayStatus(row.payment_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shippingPagination ? (
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                Page {shippingPagination.page} of {Math.max(1, Math.ceil(shippingPagination.total / shippingPagination.page_size))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadShipping(Math.max(1, shippingPagination.page - 1))}
                  disabled={shippingPagination.page <= 1}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadShipping(
                      Math.min(
                        Math.max(1, Math.ceil(shippingPagination.total / shippingPagination.page_size)),
                        shippingPagination.page + 1
                      )
                    )
                  }
                  disabled={shippingPagination.page >= Math.ceil(shippingPagination.total / shippingPagination.page_size)}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "payments" && !loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-100">Quote payments</div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Quote</th>
                  <th className="px-3 py-2 text-left">Purpose</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-900/60 text-neutral-200">
                    <td className="px-3 py-2">{csvDate(row.created_at)}</td>
                    <td className="px-3 py-2">{row.quote_token || row.quote_id}</td>
                    <td className="px-3 py-2">{row.purpose}</td>
                    <td className="px-3 py-2">{row.method}</td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2 text-right">
                      {row.currency} {Number(row.amount || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{row.paid_at ? csvDate(row.paid_at) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paymentPagination ? (
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                Page {paymentPagination.page} of {Math.max(1, Math.ceil(paymentPagination.total / paymentPagination.page_size))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadPayments(Math.max(1, paymentPagination.page - 1))}
                  disabled={paymentPagination.page <= 1}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadPayments(
                      Math.min(
                        Math.max(1, Math.ceil(paymentPagination.total / paymentPagination.page_size)),
                        paymentPagination.page + 1
                      )
                    )
                  }
                  disabled={paymentPagination.page >= Math.ceil(paymentPagination.total / paymentPagination.page_size)}
                  className="rounded-lg border border-neutral-800 px-3 py-1 text-neutral-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
