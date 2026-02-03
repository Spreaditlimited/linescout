"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Status = "pending" | "approved" | "rejected" | "paid" | "failed";

type Row = {
  id: number;
  internal_user_id: number;

  amount_kobo: number;
  currency: string;
  status: Status;

  requested_note: string | null;
  admin_note: string | null;

  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;

  paystack_transfer_code: string | null;
  paystack_reference: string | null;

  username: string;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  china_phone: string | null;
  china_city: string | null;
  nationality: string | null;

  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_verified_at: string | null;
  bank_status: string | null;
};

type ApiResp =
  | { ok: true; status: Status; items: Row[]; next_cursor: number | null }
  | { ok: false; error: string };

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

function koboToMoney(amount_kobo: any, currency: string) {
  const c = currency || "NGN";
  const n = Number(amount_kobo);
  const major = Number.isFinite(n) ? n / 100 : 0;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${c} ${Math.round(major).toLocaleString()}`;
  }
}

function maskAccount(acct?: string | null) {
  const s = String(acct || "").trim();
  if (!s) return "No bank account";
  const last4 = s.slice(-4);
  return `****${last4}`;
}

function norm(v: any) {
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function statusPill(status: Status) {
  const s = String(status || "").toLowerCase();
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

  if (s === "pending") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "approved") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "paid") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  if (s === "rejected") return `${base} border-red-700/60 bg-red-500/10 text-red-200`;
  if (s === "failed") return `${base} border-red-700/60 bg-red-500/10 text-red-200`;

  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

const card = "rounded-2xl border border-neutral-800 bg-neutral-950";
const btn =
  "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
const btnDisabled = "opacity-50 cursor-not-allowed";

const tabBtn =
  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors";
const tabIdle =
  "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700";
const tabActive = "border-neutral-600 bg-neutral-100 text-neutral-950";

const STATUSES: Array<{ key: Status; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "rejected", label: "Rejected" },
];

function displayName(r: Row) {
  const fn = String(r.first_name || "").trim();
  const ln = String(r.last_name || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || r.username || "Agent";
}

export default function AdminPayoutRequestsPage() {
  const [tab, setTab] = useState<Status>("pending");

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [cursorStack, setCursorStack] = useState<number[]>([]); // for "Back"

  const limit = 50;

  // search + debounce
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchPage(status: Status, cursor: number) {
    const qs = new URLSearchParams();
    qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("cursor", String(cursor));

    const res = await fetch(`/api/internal/admin/payout-requests?${qs.toString()}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as ApiResp | null;

    if (!res.ok || !json || !("ok" in json) || !json.ok) {
      throw new Error((json as any)?.error || "Failed to load payout requests");
    }

    return json;
  }

  async function loadFirst(status: Status) {
    setLoading(true);
    setErr(null);

    try {
      const json = await fetchPage(status, 0);
      setItems(json.items || []);
      setNextCursor(json.next_cursor ?? null);
      setCursorStack([]); // reset stack on new tab
    } catch (e: any) {
      setItems([]);
      setNextCursor(null);
      setCursorStack([]);
      setErr(e?.message || "Failed to load payout requests");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await loadFirst(tab);
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setBusy(true);
    setErr(null);

    try {
      // push current cursor state to stack so "Back" works
      setCursorStack((prev) => [...prev, nextCursor]);

      const json = await fetchPage(tab, nextCursor);
      // replace list with the next page (not append) so it behaves like paging
      setItems(json.items || []);
      setNextCursor(json.next_cursor ?? null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load payout requests");
      // rollback stack push if it failed
      setCursorStack((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function goBack() {
    // If stack is empty, go back to first page
    if (cursorStack.length <= 1) {
      await loadFirst(tab);
      return;
    }

    const prevCursor = cursorStack[cursorStack.length - 2]; // go one step back
    setBusy(true);
    setErr(null);

    try {
      // pop last cursor
      setCursorStack((prev) => prev.slice(0, -1));
      const json = await fetchPage(tab, prevCursor);
      setItems(json.items || []);
      setNextCursor(json.next_cursor ?? null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load payout requests");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadFirst(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const q = norm(debouncedSearch);
    if (!q) return items;

    return items.filter((r) => {
      const hay = [
        r.id,
        r.internal_user_id,
        r.status,
        r.currency,
        r.amount_kobo,
        r.username,
        displayName(r),
        r.email,
        r.china_phone,
        r.china_city,
        r.account_name,
        maskAccount(r.account_number),
        r.paystack_transfer_code,
        r.paystack_reference,
        r.requested_note,
        r.admin_note,
      ]
        .map(norm)
        .join(" | ");
      return hay.includes(q);
    });
  }, [items, debouncedSearch]);

  return (
    <div className="space-y-5">
      <div className={`${card} p-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">
              <Link href="/internal" className="hover:text-neutral-300">
                Admin
              </Link>{" "}
              <span className="text-neutral-700">/</span>{" "}
              <span className="text-neutral-300">Payouts</span>
            </div>

            <h2 className="mt-2 text-lg font-semibold text-neutral-100">Payouts</h2>
            <p className="text-sm text-neutral-400">
              Review and pay agents. This list is grouped by payout request status.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/internal/admin/payouts" className={`${tabBtn} ${tabActive}`}>
                Agents
              </Link>
              <Link href="/internal/user-payouts" className={`${tabBtn} ${tabIdle}`}>
                Users
              </Link>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            <div className="flex w-full items-center gap-2 lg:w-[560px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agent, username, request id, bank name, reference..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 pr-16 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="shrink-0 text-[11px] text-neutral-400">
                {filtered.length}/{items.length}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTab(s.key)}
                  className={`${tabBtn} ${tab === s.key ? tabActive : tabIdle}`}
                >
                  {s.label}
                </button>
              ))}

              <div className="flex-1" />

              <button onClick={refresh} className={btn} disabled={busy}>
                Refresh
              </button>

              <button
                onClick={goBack}
                className={`${btn} ${cursorStack.length <= 1 || busy ? btnDisabled : ""}`}
                disabled={cursorStack.length <= 1 || busy}
              >
                Back
              </button>

              <button
                onClick={loadMore}
                className={`${btn} ${!nextCursor || busy ? btnDisabled : ""}`}
                disabled={!nextCursor || busy}
              >
                Load more
              </button>
            </div>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading payout requests...</p> : null}
        {err ? (
          <div className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/30 p-4">
            <p className="text-sm text-red-200">{err}</p>
          </div>
        ) : null}

        {!loading && !err ? (
          <div className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                No payout requests in this view.
              </div>
            ) : null}

            {filtered.map((r) => {
              const amount = koboToMoney(r.amount_kobo, r.currency || "NGN");
              const bankLine =
                r.account_name || r.bank_code || r.account_number
                  ? `${r.account_name || "Account"} • ${maskAccount(r.account_number)}`
                  : "No bank account";

              const ref = r.paystack_reference || r.paystack_transfer_code;

              return (
                <div key={r.id} className={`${card} p-4`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-neutral-100">
                          {displayName(r)}
                        </div>

                        <span className={statusPill(r.status)}>{r.status}</span>

                        <span className="text-xs text-neutral-500">
                          Request #{r.id}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-neutral-400">
                        @{r.username}
                        {r.email ? ` • ${r.email}` : ""}
                        {r.china_city ? ` • ${r.china_city}` : ""}
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                          <div className="text-[11px] text-neutral-500">Amount</div>
                          <div className="mt-1 text-sm font-semibold text-neutral-100">
                            {amount}
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Requested: {fmt(r.requested_at)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                          <div className="text-[11px] text-neutral-500">Bank</div>
                          <div className="mt-1 text-sm text-neutral-200">{bankLine}</div>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Bank status: {r.bank_status || "N/A"} • Verified: {fmt(r.bank_verified_at)}
                          </div>
                        </div>
                      </div>

                      {ref ? (
                        <div className="mt-2 text-[11px] text-neutral-500 break-all">
                          Reference: {ref}
                        </div>
                      ) : null}

                      {r.requested_note ? (
                        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                          <div className="text-[11px] text-neutral-500">Agent note</div>
                          <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap">
                            {r.requested_note}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link href={`/internal/admin/payouts/${r.id}`} className={btn}>
                        Review
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-1 text-xs text-neutral-500">
              Showing {filtered.length} requests currently loaded for <span className="text-neutral-300">{tab}</span>.
              {nextCursor ? " More available." : " End of list."}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
