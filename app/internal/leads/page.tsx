// app/internal/leads/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Lead = {
  id: number;
  created_at: string;
  name: string;
  email: string;
  whatsapp: string;
  sourcing_request: string;
  status: string;
  claimed_by: number | null;
  called_by: number | null;
  called_at: string | null;
  call_summary: string | null;
};

type MeResponse =
  | {
      ok: true;
      user: {
        username: string;
        role: "admin" | "agent" | string;
        permissions: { can_view_leads: boolean; can_view_handoffs: boolean };
      };
    }
  | { ok: false; error: string };

type LeadAction = "" | "claim" | "mark_called";

type RowState = {
  open: boolean;
  action: LeadAction;
  summary: string;
};

const defaultRowState: RowState = { open: false, action: "", summary: "" };

function norm(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export default function InternalLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);

  const authed = useMemo(() => !!(me && "ok" in me && me.ok), [me]);
  const user = authed ? (me as any).user : null;

  const isAdmin = useMemo(() => !!(user?.role === "admin"), [user]);
  const canLeads = useMemo(() => {
    if (!user) return false;
    return user.role === "admin" || !!user?.permissions?.can_view_leads;
  }, [user]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [busyId, setBusyId] = useState<number | null>(null);
  const [row, setRow] = useState<Record<number, RowState>>({});

  // Search (client-side for current page)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;

    async function loadMe() {
      try {
        const res = await fetch("/internal/auth/me", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (alive && data) setMe(data);
      } catch {
        if (alive) setMe({ ok: false, error: "Failed to load session" });
      }
    }

    loadMe();
    fetchLeads(1);

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmtDate(d: string) {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString();
  }

  function fmtDateTime(d?: string | null) {
    if (!d) return "N/A";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString();
  }

  function statusBadge(status: string) {
    const s = (status || "").toLowerCase();
    const base =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

    if (s === "new") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
    if (s === "claimed") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
    if (s === "called") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;

    return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors border";

  const btnPrimary = `${btnBase} bg-white text-neutral-950 border-white hover:bg-neutral-200`;
  const btnSecondary = `${btnBase} border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700`;
  const btnDanger = `${btnBase} border-red-700/60 bg-red-500/10 text-red-200 hover:bg-red-500/15`;

  function getRowState(id: number): RowState {
    return row[id] ?? defaultRowState;
  }

  function setRowState(id: number, patch: Partial<RowState>) {
    setRow((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? defaultRowState), ...patch },
    }));
  }

  async function fetchLeads(p: number) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/linescout-leads?page=${p}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed to load leads");
      }

      setLeads(data.items || []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || p));

      // close any open row UIs when page changes
      setRow({});
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function claimLead(leadId: number) {
    setBusyId(leadId);
    try {
      const res = await fetch("/api/linescout-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          leadId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to claim lead");

      await fetchLeads(page);
    } finally {
      setBusyId(null);
    }
  }

  async function markCalled(leadId: number, summary: string) {
    setBusyId(leadId);
    try {
      const res = await fetch("/api/linescout-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "called",
          leadId,
          callSummary: summary,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to mark called");

      await fetchLeads(page);
    } finally {
      setBusyId(null);
    }
  }

  function allowedActions(lead: Lead): LeadAction[] {
    const s = (lead.status || "").toLowerCase();
    if (s === "new") return ["claim", "mark_called"];
    if (s === "claimed") return ["mark_called"];
    return [];
  }

  async function submitRowAction(lead: Lead) {
    const st = getRowState(lead.id);
    if (!st.action) return;

    if (!canLeads) {
      alert("You don’t have Leads access.");
      return;
    }

    if (st.action === "claim") {
      await claimLead(lead.id);
      setRowState(lead.id, { open: false, action: "" });
      return;
    }

    if (st.action === "mark_called") {
      const summary = (st.summary || "").trim();
      if (!summary) {
        alert("Please enter a brief call summary.");
        return;
      }
      await markCalled(lead.id, summary);
      setRowState(lead.id, { open: false, action: "", summary: "" });
      return;
    }
  }

  const filteredLeads = useMemo(() => {
    const q = norm(debouncedSearch);
    if (!q) return leads;

    return leads.filter((lead) => {
      const hay = [
        lead.id,
        lead.name,
        lead.email,
        lead.whatsapp,
        lead.sourcing_request,
        lead.status,
        lead.claimed_by ? "claimed" : "",
        lead.called_by ? "called" : "",
        lead.call_summary,
      ]
        .map(norm)
        .join(" | ");

      return hay.includes(q);
    });
  }, [leads, debouncedSearch]);

  const totalOnPage = leads.length;
  const shownOnPage = filteredLeads.length;
  const hasSearch = norm(debouncedSearch).length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Leads</h2>
            <p className="text-sm text-neutral-400">
              Claim leads, call customers, and log outcomes.
            </p>
            {!isAdmin ? (
              <p className="mt-1 text-xs text-neutral-500">
                Signed in as agent. Leads access: {canLeads ? "Yes" : "No"}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {/* Search bar */}
            <div className="flex w-full items-center gap-2 sm:w-[420px]">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, WhatsApp, request, status, ID..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 pr-10 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                />
                {search.trim() ? (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800"
                    aria-label="Clear search"
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="shrink-0 text-[11px] text-neutral-400">
                {hasSearch ? <span>{shownOnPage}/{totalOnPage}</span> : <span>{totalOnPage}</span>}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fetchLeads(page)} className={btnSecondary}>
                Refresh
              </button>

              <div className="ml-0 sm:ml-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => fetchLeads(page - 1)}
                  className={`${btnSecondary} ${!canPrev ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Prev
                </button>
                <div className="text-sm text-neutral-400 whitespace-nowrap">
                  Page {page} of {totalPages}
                </div>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => fetchLeads(page + 1)}
                  className={`${btnSecondary} ${!canNext ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading && <p className="mt-4 text-sm text-neutral-400">Loading leads...</p>}
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        {!loading && !error && shownOnPage === 0 ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <p className="text-sm text-neutral-300">No matches for your search.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Try searching by WhatsApp number, email, or a keyword in the request.
            </p>
          </div>
        ) : null}

        {!loading && !error && shownOnPage > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Date</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Lead</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Contact</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Request</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Status</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Call Log</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Update</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {filteredLeads.map((lead) => {
                  const st = getRowState(lead.id);
                  const disabled = busyId === lead.id;
                  const allowed = allowedActions(lead);

                  return (
                    <tr
                      key={lead.id}
                      className="border-t border-neutral-800 hover:bg-neutral-900/40 align-top"
                    >
                      <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                        {fmtDate(lead.created_at)}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-neutral-100">{lead.name || "N/A"}</div>
                        <div className="text-xs text-neutral-500">ID: {lead.id}</div>
                      </td>

                      <td className="px-3 py-3 text-xs text-neutral-300">
                        <div>{lead.whatsapp || "N/A"}</div>
                        <div className="text-neutral-500">{lead.email || "N/A"}</div>
                      </td>

                      <td className="px-3 py-3 max-w-[420px]">
                        <div className="text-neutral-100 line-clamp-3">{lead.sourcing_request}</div>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={statusBadge(lead.status)}>{lead.status}</span>
                        <div className="mt-1 text-[11px] text-neutral-500">
                          Claimed: {lead.claimed_by ? "Yes" : "No"}
                        </div>
                      </td>

                      <td className="px-3 py-3 min-w-[280px]">
                        {lead.status === "called" ? (
                          <div className="text-sm text-neutral-200">
                            <div className="text-xs text-neutral-500">
                              Called at: {fmtDateTime(lead.called_at)}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap">{lead.call_summary || ""}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-neutral-500">Not called yet</div>
                        )}
                      </td>

                      <td className="px-3 py-3 min-w-[320px]">
                        {allowed.length === 0 ? (
                          <div className="text-xs text-neutral-500">No actions</div>
                        ) : !canLeads ? (
                          <div className="text-xs text-neutral-500">
                            You don’t have permission to update leads.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setRowState(lead.id, { open: !st.open })}
                                disabled={disabled}
                                className={`${btnSecondary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                Update lead
                              </button>

                              {st.open ? (
                                <button
                                  onClick={() =>
                                    setRowState(lead.id, { open: false, action: "", summary: "" })
                                  }
                                  disabled={disabled}
                                  className={`${btnDanger} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  Close
                                </button>
                              ) : null}
                            </div>

                            {st.open ? (
                              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                                <label className="text-xs text-neutral-400">Action</label>
                                <select
                                  value={st.action}
                                  onChange={(e) =>
                                    setRowState(lead.id, {
                                      action: e.target.value as any,
                                      summary: "",
                                    })
                                  }
                                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                                >
                                  <option value="">Select action</option>
                                  {allowed.includes("claim") ? (
                                    <option value="claim">Claim</option>
                                  ) : null}
                                  {allowed.includes("mark_called") ? (
                                    <option value="mark_called">Mark called</option>
                                  ) : null}
                                </select>

                                {st.action === "mark_called" ? (
                                  <div className="mt-3">
                                    <label className="text-xs text-neutral-400">Call summary</label>
                                    <textarea
                                      value={st.summary}
                                      onChange={(e) =>
                                        setRowState(lead.id, { summary: e.target.value })
                                      }
                                      className="mt-1 w-full min-h-[80px] resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-600"
                                      placeholder="Outcome, next steps, and notes..."
                                    />
                                  </div>
                                ) : null}

                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    onClick={() => submitRowAction(lead)}
                                    disabled={disabled || !st.action}
                                    className={`${btnPrimary} ${
                                      disabled || !st.action ? "opacity-60 cursor-not-allowed" : ""
                                    }`}
                                  >
                                    {disabled ? "Saving..." : "Save"}
                                  </button>

                                  <div className="text-[11px] text-neutral-500">
                                    {isAdmin ? "Admin" : "Agent"}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-3 py-3 text-xs text-neutral-500">
              Showing {shownOnPage} of {totalOnPage} on this page. Total leads: {total}.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}