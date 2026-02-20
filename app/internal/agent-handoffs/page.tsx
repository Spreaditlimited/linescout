// app/internal/agent-handoffs/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Handoff = {
  id: number;
  token: string;
  handoff_type: string;

  customer_name?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;

  status: string;
  created_at: string;

  claimed_by?: string | null;
  claimed_at?: string | null;

  quote_count?: number | null;
  latest_quote_at?: string | null;
};

type SummaryWindow = "all" | "30" | "60" | "90";

type Summary = {
  window: SummaryWindow;
  as_of: string;
  totals: {
    projects: number;
    cancelled: number;
    active: number;
    completed: number;
  };
  status_counts: {
    pending: number;
    claimed: number;
    manufacturer_found: number;
    paid: number;
    shipped: number;
    delivered: number;
    resolved: number;
    cancelled: number;
  };
  avg_stage_hours: {
    pending_to_claimed: number | null;
    claimed_to_manufacturer_found: number | null;
    manufacturer_found_to_paid: number | null;
    paid_to_shipped: number | null;
    shipped_to_delivered: number | null;
  };
  sla_alerts: {
    unclaimed_over_24h: number;
    manufacturer_over_96h: number;
    paid_not_shipped_over_21d: number;
  };
  stuck_counts: {
    pending: number;
    claimed: number;
    manufacturer_found: number;
    paid: number;
    shipped: number;
  };
  agent_points_top: Array<{
    agent_id: number;
    agent_name: string;
    total_points: number;
    projects_scored: number;
  }>;
};

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

function fmtHours(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 24) return `${(v / 24).toFixed(1)}d`;
  return `${v.toFixed(1)}h`;
}

function windowLabel(w: SummaryWindow) {
  if (w === "all") return "All time";
  return `Last ${w} days`;
}

function norm(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function badge(status: string) {
  const s = (status || "").toLowerCase();
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

  if (s === "pending") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "claimed") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "manufacturer_found")
    return `${base} border-indigo-700/60 bg-indigo-500/10 text-indigo-200`;
  if (s === "paid") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  if (s === "shipped") return `${base} border-violet-700/60 bg-violet-500/10 text-violet-200`;
  if (s === "delivered") return `${base} border-green-700/60 bg-green-500/10 text-green-200`;
  if (s === "cancelled") return `${base} border-red-700/60 bg-red-500/10 text-red-200`;

  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

export default function AgentHandoffsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryWindow, setSummaryWindow] = useState<SummaryWindow>("all");
  const [excludeTest, setExcludeTest] = useState(false);

  // search + debounce
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // pagination (client side for now)
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryErr(null);
    try {
      const res = await fetch(
        `/api/internal/handoffs/summary?window=${summaryWindow}&exclude_test=${excludeTest ? "1" : "0"}`,
        {
        cache: "no-store",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load summary");
      setSummary(data as Summary);
    } catch (e: any) {
      setSummaryErr(e?.message || "Failed to load summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/linescout-handoffs?exclude_test=${excludeTest ? "1" : "0"}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load handoffs");
      setHandoffs((data.handoffs || []) as Handoff[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load handoffs");
    } finally {
      setLoading(false);
    }
  }

  // ✅ No auto-refresh. Only manual refresh button.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeTest]);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryWindow, excludeTest]);

  const filtered = useMemo(() => {
    const q = norm(debouncedSearch);
    if (!q) return handoffs;

    return handoffs.filter((h) => {
      const hay = [
        h.id,
        h.token,
        h.handoff_type,
        h.customer_name,
        h.email,
        h.whatsapp_number,
        h.status,
        h.claimed_by,
      ]
        .map(norm)
        .join(" | ");

      return hay.includes(q);
    });
  }, [handoffs, debouncedSearch]);

  const totalCount = handoffs.length;
  const shownCount = filtered.length;

  const totalPages = Math.max(1, Math.ceil(shownCount / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const btnSm =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700";
  const btnDisabled = "opacity-50 cursor-not-allowed";
  const pill =
    "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] text-neutral-300";
  const card =
    "rounded-2xl border border-neutral-800 bg-neutral-950 p-4";
  const metric =
    "rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2";

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Snapshot</h2>
            <p className="text-sm text-neutral-400">
              Summary of sourcing projects and stage timings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] text-neutral-300">
              <input
                type="checkbox"
                checked={excludeTest}
                onChange={(e) => setExcludeTest(e.target.checked)}
                className="h-3 w-3 rounded border-neutral-700 bg-neutral-950"
              />
              Exclude test emails
            </label>
            {(["all", "30", "60", "90"] as SummaryWindow[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setSummaryWindow(w)}
                className={`${btnSm} ${summaryWindow === w ? "border-neutral-500 text-neutral-100" : ""}`}
              >
                {w === "all" ? "All" : `${w}d`}
              </button>
            ))}
            <button onClick={loadSummary} className={btnSm} disabled={summaryLoading}>
              {summaryLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className={pill}>{windowLabel(summaryWindow)}</span>
          {summary?.as_of ? <span>As of {fmt(summary.as_of)}</span> : null}
        </div>

        {summaryErr ? <p className="mt-3 text-sm text-red-300">{summaryErr}</p> : null}
        {summaryLoading ? <p className="mt-3 text-sm text-neutral-400">Loading summary...</p> : null}

        {!summaryLoading && summary ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={metric}>
                <div className="text-xs text-neutral-500">Total projects</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">
                  {summary.totals.projects}
                </div>
              </div>
              <div className={metric}>
                <div className="text-xs text-neutral-500">Active</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">
                  {summary.totals.active}
                </div>
              </div>
              <div className={metric}>
                <div className="text-xs text-neutral-500">Cancelled</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">
                  {summary.totals.cancelled}
                </div>
              </div>
              <div className={metric}>
                <div className="text-xs text-neutral-500">Completed</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">
                  {summary.totals.completed}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Stage Counts
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className={metric}>
                  <div className="text-xs text-neutral-500">Pending</div>
                  <div className="mt-1 text-base font-semibold text-neutral-100">
                    {summary.status_counts.pending}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-xs text-neutral-500">Claimed</div>
                  <div className="mt-1 text-base font-semibold text-neutral-100">
                    {summary.status_counts.claimed}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-xs text-neutral-500">Manufacturer Found</div>
                  <div className="mt-1 text-base font-semibold text-neutral-100">
                    {summary.status_counts.manufacturer_found}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-xs text-neutral-500">Shipping</div>
                  <div className="mt-1 text-base font-semibold text-neutral-100">
                    {summary.status_counts.shipped}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Avg Time Between Stages
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className={metric}>
                  <div className="text-[11px] text-neutral-500">Pending → Claimed</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {fmtHours(summary.avg_stage_hours.pending_to_claimed)}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-[11px] text-neutral-500">Claimed → Manufacturer</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {fmtHours(summary.avg_stage_hours.claimed_to_manufacturer_found)}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-[11px] text-neutral-500">Manufacturer → Paid</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {fmtHours(summary.avg_stage_hours.manufacturer_found_to_paid)}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-[11px] text-neutral-500">Paid → Shipped</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {fmtHours(summary.avg_stage_hours.paid_to_shipped)}
                  </div>
                </div>
                <div className={metric}>
                  <div className="text-[11px] text-neutral-500">Shipped → Delivered</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {fmtHours(summary.avg_stage_hours.shipped_to_delivered)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  SLA Alerts
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Unclaimed &gt; 24h</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.sla_alerts.unclaimed_over_24h}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Claimed &gt; 96h (no manufacturer)</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.sla_alerts.manufacturer_over_96h}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Paid &gt; 21d (not shipped)</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.sla_alerts.paid_not_shipped_over_21d}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Stuck In Stage
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Pending</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.stuck_counts.pending}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Claimed</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.stuck_counts.claimed}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Manufacturer Found</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.stuck_counts.manufacturer_found}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Paid</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.stuck_counts.paid}
                    </div>
                  </div>
                  <div className={metric}>
                    <div className="text-[11px] text-neutral-500">Shipped</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {summary.stuck_counts.shipped}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Top Agents By Points
              </div>
              <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Agent</th>
                      <th className="px-3 py-2 text-left">Total points</th>
                      <th className="px-3 py-2 text-left">Projects scored</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {summary.agent_points_top.length ? (
                      summary.agent_points_top.map((a) => (
                        <tr key={a.agent_id} className="border-t border-neutral-800">
                          <td className="px-3 py-2 text-neutral-100">{a.agent_name}</td>
                          <td className="px-3 py-2 text-neutral-200">{a.total_points}</td>
                          <td className="px-3 py-2 text-neutral-200">{a.projects_scored}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={3} className="px-3 py-3 text-neutral-400">
                          No scored projects yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Sourcing Projects</h2>
            <p className="text-sm text-neutral-400">
              List view only. Use “View” to open the full operational handoff page.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full items-center gap-2 sm:w-[420px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search token, name, email, WhatsApp, status..."
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
                {shownCount}/{totalCount}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={load} className={btn} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>

              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`${btn} ${!canPrev ? btnDisabled : ""}`}
              >
                Prev
              </button>

              <div className="text-sm text-neutral-400 whitespace-nowrap">
                Page {page} of {totalPages}
              </div>

              <button
                type="button"
                disabled={!canNext}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={`${btn} ${!canNext ? btnDisabled : ""}`}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading handoffs...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {!loading && !err && shownCount === 0 ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <p className="text-sm text-neutral-300">No matches.</p>
            <p className="mt-1 text-xs text-neutral-500">Try token (SRC-/WL-), email, WhatsApp, or owner.</p>
          </div>
        ) : null}

        {!loading && !err && shownCount > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="w-full table-fixed text-sm">
              {/* ✅ Tight column widths */}
              {/* created | token | type | customer | email | whatsapp | owner | quote | status | view */}
              <colgroup>
                <col className="w-[170px]" />
                <col className="w-[170px]" />
                <col className="w-[120px]" />
                <col className="w-[170px]" />
                <col className="w-[220px]" />
                <col className="w-[140px]" />
                <col className="w-[170px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[90px]" />
              </colgroup>

              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Created</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Token</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Type</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Customer</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Email</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">WhatsApp</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Owner</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Quote</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800 whitespace-nowrap">View</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {paged.map((h) => (
                  <tr key={h.id} className="border-t border-neutral-800 hover:bg-neutral-900/40 align-top">
                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {fmt(h.created_at)}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-semibold text-neutral-100 whitespace-nowrap overflow-hidden text-ellipsis">
                        {h.token}
                      </div>
                      <div className="text-[11px] text-neutral-500 whitespace-nowrap">ID: {h.id}</div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap overflow-hidden text-ellipsis">
                      {h.handoff_type}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-neutral-100 whitespace-nowrap overflow-hidden text-ellipsis">
                        {h.customer_name || "N/A"}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap overflow-hidden text-ellipsis">
                      {h.email || "N/A"}
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap overflow-hidden text-ellipsis">
                      {h.whatsapp_number || "N/A"}
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300">
                      <div className="text-neutral-100 whitespace-nowrap overflow-hidden text-ellipsis">
                        {h.claimed_by || "Unclaimed"}
                      </div>
                      <div className="text-neutral-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        {h.claimed_at ? fmt(h.claimed_at) : "N/A"}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300">
                      {(() => {
                        const count = Number(h.quote_count || 0);
                        return (
                          <>
                            <div className="text-neutral-100 whitespace-nowrap">
                              {count > 0 ? `${count} quote${count === 1 ? "" : "s"}` : "None"}
                            </div>
                            <div className="text-neutral-500 whitespace-nowrap overflow-hidden text-ellipsis">
                              {h.latest_quote_at ? fmt(h.latest_quote_at) : "—"}
                            </div>
                          </>
                        );
                      })()}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={badge(h.status)}>{h.status}</span>
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <Link href={`/internal/agent-handoffs/${h.id}`} className={btnSm}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}

                {paged.length === 0 ? (
                  <tr className="border-t border-neutral-800">
                    <td colSpan={10} className="px-3 py-4 text-sm text-neutral-400">
                      No handoffs.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="px-3 py-3 text-xs text-neutral-500">
              Showing {paged.length} of {shownCount}. Total handoffs loaded: {totalCount}.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
