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
};

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
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

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/linescout-handoffs", { cache: "no-store" });
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

  return (
    <div className="space-y-5">
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
              {/* created | token | type | customer | email | whatsapp | owner | status | view */}
              <colgroup>
                <col className="w-[170px]" />
                <col className="w-[170px]" />
                <col className="w-[120px]" />
                <col className="w-[170px]" />
                <col className="w-[220px]" />
                <col className="w-[140px]" />
                <col className="w-[170px]" />
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
                    <td colSpan={9} className="px-3 py-4 text-sm text-neutral-400">
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