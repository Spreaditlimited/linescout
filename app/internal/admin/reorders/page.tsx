"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../../_components/SearchableSelect";

type ReorderItem = {
  id: number;
  user_id: number;
  user_email?: string | null;
  conversation_id: number;
  handoff_id: number;
  source_conversation_id?: number | null;
  source_handoff_id?: number | null;
  new_conversation_id?: number | null;
  new_handoff_id?: number | null;
  route_type: string;
  status: string;
  original_agent_id?: number | null;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;
  assigned_agent_email?: string | null;
  user_note?: string | null;
  admin_note?: string | null;
  created_at?: string | null;
};

type AgentItem = {
  id: number;
  username: string;
  email?: string | null;
  is_active?: number;
  approval_status?: string | null;
};

function statusBadge(status?: string | null) {
  const s = String(status || "").toLowerCase();
  const base = "rounded-full border px-3 py-1 text-xs font-semibold";
  if (s === "pending_admin") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "assigned") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "in_progress") return `${base} border-indigo-700/60 bg-indigo-500/10 text-indigo-200`;
  if (s === "closed") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

export default function ReordersAdminPage() {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Record<number, boolean>>({});
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({});
  const [agentPick, setAgentPick] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (statusFilter) qs.set("status", statusFilter);
        if (query) qs.set("q", query);
        const res = await fetch(`/api/internal/admin/reorders?${qs.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load reorders");
        if (active) setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load reorders");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [statusFilter, query]);

  useEffect(() => {
    let alive = true;
    async function loadAgents() {
      try {
        const res = await fetch("/api/internal/admin/agents?limit=200&cursor=0", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) return;
        const mapped = (Array.isArray(data.items) ? data.items : []).map((a: any) => ({
          id: Number(a.internal_user_id),
          username: String(a.username || ""),
          email: a?.profile?.email || null,
          is_active: a.is_active ? 1 : 0,
          approval_status: a?.checklist?.approved_to_claim ? "approved" : "pending",
        }));
        if (alive) setAgents(mapped);
      } catch {
        // silent
      }
    }
    loadAgents();
    return () => {
      alive = false;
    };
  }, []);

  const activeAgents = useMemo(
    () =>
      agents.filter(
        (a) => Number(a.is_active ?? 1) === 1 && String(a.approval_status || "") === "approved"
      ),
    [agents]
  );

  async function assign(reorderId: number) {
    const agentIdRaw = agentPick[reorderId];
    const agentId = Number(agentIdRaw || 0);
    if (!agentId) return;

    setAssigning((prev) => ({ ...prev, [reorderId]: true }));
    try {
      const res = await fetch("/api/internal/admin/reorders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reorder_id: reorderId,
          agent_id: agentId,
          admin_note: noteDraft[reorderId] || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to assign");
      setItems((prev) =>
        prev.map((it) =>
          it.id === reorderId
            ? { ...it, status: "assigned", assigned_agent_id: agentId }
            : it
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to assign");
    } finally {
      setAssigning((prev) => ({ ...prev, [reorderId]: false }));
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Re-order Requests</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Assign re-order requests to active agents or review status updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SearchableSelect
            value={statusFilter}
            options={[
              { value: "", label: "All statuses" },
              { value: "pending_admin", label: "Pending admin" },
              { value: "assigned", label: "Assigned" },
              { value: "in_progress", label: "In progress" },
              { value: "closed", label: "Closed" },
            ]}
            onChange={(next) => setStatusFilter(next)}
            className="w-44"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or project ID"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
          />
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm text-neutral-400">
          Loading re-orders…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm text-neutral-400">
          No re-order requests found.
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-100">
                    Reorder #{item.id}
                  </span>
                  <span className="text-xs text-neutral-400">
                    Original #{item.source_conversation_id || item.conversation_id}
                  </span>
                  {item.new_conversation_id ? (
                    <span className="text-xs text-neutral-400">
                      New #{item.new_conversation_id}
                    </span>
                  ) : null}
                  <span className={statusBadge(item.status)}>{item.status}</span>
                </div>
                <span className="text-xs text-neutral-500">{item.route_type}</span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2">
                <div>
                  <div>User: <span className="text-neutral-200">{item.user_email || "N/A"}</span></div>
                  <div>
                    Original handoff: <span className="text-neutral-200">{item.source_handoff_id || item.handoff_id}</span>
                  </div>
                  {item.new_handoff_id ? (
                    <div>
                      New handoff: <span className="text-neutral-200">{item.new_handoff_id}</span>
                    </div>
                  ) : null}
                </div>
                <div>
                  <div>
                    Assigned agent:{" "}
                    <span className="text-neutral-200">
                      {item.assigned_agent_username || (item.assigned_agent_id ? `ID ${item.assigned_agent_id}` : "Unassigned")}
                    </span>
                  </div>
                  <div>Created: <span className="text-neutral-200">{item.created_at || "N/A"}</span></div>
                </div>
              </div>

              {item.user_note ? (
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs text-neutral-300">
                  User note: {item.user_note}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={agentPick[item.id] || ""}
                  options={[
                    { value: "", label: "Assign agent" },
                    ...activeAgents.map((agent) => ({
                      value: String(agent.id),
                      label: agent.username || `Agent ${agent.id}`,
                    })),
                  ]}
                  onChange={(next) =>
                    setAgentPick((prev) => ({ ...prev, [item.id]: next }))
                  }
                  className="w-60"
                />
                <input
                  value={noteDraft[item.id] || ""}
                  onChange={(e) =>
                    setNoteDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Admin note (optional)"
                  className="flex-1 min-w-[200px] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                />
                <button
                  type="button"
                  onClick={() => assign(item.id)}
                  disabled={assigning[item.id] || !agentPick[item.id]}
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-50"
                >
                  {assigning[item.id] ? "Assigning..." : "Assign"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
