// app/internal/agent-handoffs/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Agent = {
  id: number;
  name: string;
};

type Handoff = {
  id: number;
  token: string;
  handoff_type: string;
  context: string;
  whatsapp_number: string;
  status: string;
  created_at: string;

  claimed_by?: string;
  claimed_at?: string | null;

  manufacturer_found_at?: string | null;
  paid_at?: string | null;

  shipped_at?: string | null;
  shipper?: string | null;
  tracking_number?: string | null;

  delivered_at?: string | null;

  cancelled_at?: string | null;
  cancel_reason?: string | null;
};

export default function AgentHandoffsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | "">(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem("linescout_agent_id");
    return saved ? Number(saved) : "";
  });

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectedAgentName() {
    const a = agents.find((x) => x.id === selectedAgentId);
    return a?.name || "";
  }

  function saveAgent(id: number) {
    setSelectedAgentId(id);
    localStorage.setItem("linescout_agent_id", String(id));
  }

  useEffect(() => {
    let alive = true;

    async function loadHandoffs() {
      try {
        setError(null);
        const res = await fetch("/api/linescout-handoffs", { cache: "no-store" });
        const data = await res.json();

        if (!data.ok) throw new Error(data.error || "Failed to load handoffs");
        if (alive) setHandoffs(data.handoffs || []);
      } catch (err: any) {
        if (alive) setError(err.message || "Error loading handoffs");
      } finally {
        if (alive) setLoading(false);
      }
    }

    async function loadAgents() {
      try {
        const res = await fetch("/api/internal/agents");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load agents");
        if (alive) setAgents(data.items || []);
      } catch (err: any) {
        if (alive) setError(err.message || "Failed to load agents");
      }
    }

    loadAgents();
    loadHandoffs();
    const interval = setInterval(loadHandoffs, 5000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  function fmt(d?: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  }

  function badge(status: string) {
    const s = (status || "").toLowerCase();

    const base =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

    if (s === "pending")
      return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
    if (s === "claimed")
      return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
    if (s === "manufacturer_found")
      return `${base} border-indigo-700/60 bg-indigo-500/10 text-indigo-200`;
    if (s === "paid")
      return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
    if (s === "shipped")
      return `${base} border-violet-700/60 bg-violet-500/10 text-violet-200`;
    if (s === "delivered")
      return `${base} border-green-700/60 bg-green-500/10 text-green-200`;
    if (s === "cancelled")
      return `${base} border-red-700/60 bg-red-500/10 text-red-200`;

    return `${base} border-slate-700 bg-slate-900/60 text-slate-200`;
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border";

  const btnPrimary =
    `${btnBase} border-emerald-600 bg-emerald-500 text-slate-950 hover:bg-emerald-400`;
  const btnSecondary =
    `${btnBase} border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500`;
  const btnWarn =
    `${btnBase} border-amber-700 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15`;
  const btnDanger =
    `${btnBase} border-red-700 bg-red-500/10 text-red-200 hover:bg-red-500/15`;

  async function updateStatus(
    id: number,
    status: string,
    extra: Record<string, string> = {}
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/linescout-handoffs/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, ...extra }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed to update status");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function claim(id: number) {
    const agent = selectedAgentName();
    if (!agent) {
      alert("Please select your agent name first.");
      return;
    }

    setBusyId(id);
    try {
      const res = await fetch("/api/linescout-handoffs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, agent }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        alert(data?.error || "Could not claim this handoff.");
        return;
      }

      alert("Claimed successfully.");
    } finally {
      setBusyId(null);
    }
  }

  function StatusActions({ h }: { h: Handoff }) {
    const disabled = busyId === h.id;

    return (
      <div className="flex flex-wrap gap-2">
        {h.status === "pending" && !h.claimed_by && (
          <button
            onClick={() => claim(h.id)}
            disabled={disabled}
            className={`${btnPrimary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {disabled ? "Working…" : "Claim"}
          </button>
        )}

        {h.status === "claimed" && (
          <button
            onClick={() => updateStatus(h.id, "manufacturer_found")}
            disabled={disabled}
            className={`${btnSecondary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Manufacturer Found
          </button>
        )}

        {h.status === "manufacturer_found" && (
          <button
            onClick={() => updateStatus(h.id, "paid")}
            disabled={disabled}
            className={`${btnWarn} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Mark Paid
          </button>
        )}

        {h.status === "paid" && (
          <button
            onClick={() => {
              const shipper = prompt("Shipper name (example: Sure Imports Sea Freight)");
              if (!shipper) return;

              const trackingNumber = prompt("Tracking number / Reference");
              if (!trackingNumber) return;

              updateStatus(h.id, "shipped", {
                shipper,
                tracking_number: trackingNumber,
              });
            }}
            disabled={disabled}
            className={`${btnSecondary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Mark Shipped
          </button>
        )}

        {h.status === "shipped" && (
          <button
            onClick={() => updateStatus(h.id, "delivered")}
            disabled={disabled}
            className={`${btnPrimary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Mark Delivered
          </button>
        )}

        {h.status !== "delivered" && h.status !== "cancelled" && (
          <button
            onClick={() => {
              const reason = prompt("Cancellation reason");
              if (!reason) return;

              updateStatus(h.id, "cancelled", { cancel_reason: reason });
            }}
            disabled={disabled}
            className={`${btnDanger} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Internal header + nav */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">Internal</div>

          <div className="flex items-center gap-2">
            <Link
              href="/internal/leads"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
            >
              Leads
            </Link>

            <Link
              href="/internal/agent-handoffs"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              Handoffs
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">LineScout - Agent Handoffs</h1>
            <p className="mt-1 text-xs text-slate-400">
              Track sourcing handoffs end-to-end: claim, manufacturer found, paid, shipped, delivered, cancelled.
            </p>
          </div>

          {/* Agent dropdown (shared with Leads via localStorage linescout_agent_id) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs text-slate-400">Agent</label>
            <select
              value={selectedAgentId}
              onChange={(e) => saveAgent(Number(e.target.value))}
              className="w-full sm:w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            >
              <option value="">Select agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="text-slate-400">Loading handoffs…</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {!loading && !error && handoffs.length === 0 && (
          <p className="text-slate-400">No handoffs yet.</p>
        )}

        {!loading && !error && handoffs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Created</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Token</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Context</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">WhatsApp</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Claimed By</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Claimed At</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Status</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Milestones</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left">Action</th>
                </tr>
              </thead>

              <tbody>
                {handoffs.map((h) => (
                  <tr key={h.id} className="odd:bg-slate-900/30 align-top">
                    <td className="border-b border-slate-900 px-3 py-3 text-xs text-slate-300">
                      {fmt(h.created_at)}
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3">
                      <div className="font-semibold text-slate-100">{h.token}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {h.handoff_type}
                      </div>
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3">
                      <div className="text-slate-100">{h.context}</div>
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3 text-xs text-slate-300">
                      {h.whatsapp_number || "—"}
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3 text-xs text-slate-300">
                      {h.claimed_by || "—"}
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3 text-xs text-slate-300">
                      {fmt(h.claimed_at)}
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3">
                      <span className={badge(h.status)}>{h.status}</span>
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3">
                      <div className="space-y-1 text-[11px] text-slate-400">
                        <div>
                          <span className="text-slate-500">Manufacturer:</span>{" "}
                          {fmt(h.manufacturer_found_at)}
                        </div>
                        <div>
                          <span className="text-slate-500">Paid:</span>{" "}
                          {fmt(h.paid_at)}
                        </div>
                        <div>
                          <span className="text-slate-500">Shipped:</span>{" "}
                          {fmt(h.shipped_at)}
                        </div>
                        {h.shipped_at ? (
                          <div className="text-[11px] text-slate-400">
                            <span className="text-slate-500">Shipper:</span>{" "}
                            {h.shipper || "—"}
                            <br />
                            <span className="text-slate-500">Tracking:</span>{" "}
                            {h.tracking_number || "—"}
                          </div>
                        ) : null}
                        <div>
                          <span className="text-slate-500">Delivered:</span>{" "}
                          {fmt(h.delivered_at)}
                        </div>
                        {h.cancelled_at ? (
                          <div className="text-[11px] text-red-300/90">
                            <span className="text-red-300/70">Cancelled:</span>{" "}
                            {fmt(h.cancelled_at)}
                            <br />
                            <span className="text-red-300/70">Reason:</span>{" "}
                            {h.cancel_reason || "—"}
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="border-b border-slate-900 px-3 py-3">
                      <StatusActions h={h} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          Tip: The dashboard refreshes every 5 seconds.
        </div>
      </main>
    </div>
  );
}