// app/internal/leads/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

type Agent = {
  id: number;
  name: string;
};

export default function InternalLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [selectedAgentId, setSelectedAgentId] = useState<number | "">(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem("linescout_agent_id");
    return saved ? Number(saved) : "";
  });

  const [draftSummary, setDraftSummary] = useState<Record<number, string>>({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function fetchLeads(p: number) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/linescout-leads?page=${p}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed to load leads");
      }

      setLeads(data.items || []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || p));
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAgents() {
    try {
      const res = await fetch("/api/internal/agents");
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed to load agents");
      }

      setAgents(data.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to load agents");
    }
  }

  useEffect(() => {
    fetchAgents();
    fetchLeads(1);
  }, []);

  function saveAgent(id: number) {
    setSelectedAgentId(id);
    localStorage.setItem("linescout_agent_id", String(id));
  }

  async function claimLead(leadId: number) {
    if (!selectedAgentId) {
      alert("Select your name first.");
      return;
    }

    try {
      const res = await fetch("/api/linescout-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          leadId,
          agentId: selectedAgentId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to claim lead");

      await fetchLeads(page);
    } catch (err: any) {
      alert(err.message || "Could not claim lead");
    }
  }

  async function markCalled(leadId: number) {
    if (!selectedAgentId) {
      alert("Select your name first.");
      return;
    }

    const summary = (draftSummary[leadId] || "").trim();
    if (!summary) {
      alert("Please enter a brief call summary first.");
      return;
    }

    try {
      const res = await fetch("/api/linescout-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "called",
          leadId,
          agentId: selectedAgentId,
          callSummary: summary,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to mark called");

      setDraftSummary((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });

      await fetchLeads(page);
    } catch (err: any) {
      alert(err.message || "Could not update lead");
    }
  }

  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Internal header + nav */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">
            Internal
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/internal/leads"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              Leads
            </Link>

            <Link
              href="/internal/agent-handoffs"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
            >
              Handoffs
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Leads</h1>
              <p className="text-sm text-slate-400">
                Select your name, claim a lead, then mark as called with a summary.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedAgentId}
                onChange={(e) => saveAgent(Number(e.target.value))}
                className="w-60 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 outline-none"
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => fetchLeads(page)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
              >
                Refresh
              </button>

              <div className="ml-0 sm:ml-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => fetchLeads(page - 1)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <div className="text-sm text-slate-400 whitespace-nowrap">
                  Page {page} of {totalPages}
                </div>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => fetchLeads(page + 1)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {loading && <p className="text-sm text-slate-400">Loading leads…</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-slate-800 text-sm">
                <thead className="bg-slate-900/70 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">WhatsApp</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Request</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Call summary</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {leads.map((lead) => {
                    const isNew = lead.status === "new";
                    const isClaimed = lead.status === "claimed";
                    const isCalled = lead.status === "called";

                    return (
                      <tr
                        key={lead.id}
                        className="border-t border-slate-800 hover:bg-slate-900/50 align-top"
                      >
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2">{lead.name}</td>
                        <td className="px-3 py-2">{lead.whatsapp}</td>
                        <td className="px-3 py-2">{lead.email}</td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <div className="truncate">{lead.sourcing_request}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="capitalize">{lead.status}</span>
                          {lead.claimed_by ? (
                            <span className="text-slate-400">
                              {" "}
                              (Agent {lead.claimed_by})
                            </span>
                          ) : null}
                        </td>

                        <td className="px-3 py-2 min-w-[260px]">
                          {isCalled ? (
                            <div className="text-slate-300">
                              {lead.call_summary || ""}
                            </div>
                          ) : (
                            <textarea
                              value={draftSummary[lead.id] ?? ""}
                              onChange={(e) =>
                                setDraftSummary((prev) => ({
                                  ...prev,
                                  [lead.id]: e.target.value,
                                }))
                              }
                              placeholder="Brief call summary…"
                              className="w-full min-h-[70px] resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 outline-none"
                            />
                          )}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex flex-col gap-2">
                            <button
                              disabled={!isNew}
                              onClick={() => claimLead(lead.id)}
                              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:cursor-not-allowed"
                            >
                              Claim
                            </button>

                            <button
                              disabled={isCalled || (!isClaimed && !isNew)}
                              onClick={() => markCalled(lead.id)}
                              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Mark called
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3 text-xs text-slate-500">
                Showing {leads.length} of {total} leads.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}