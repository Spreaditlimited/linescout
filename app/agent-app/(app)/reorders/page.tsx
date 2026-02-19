"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AgentAppShell from "../_components/AgentAppShell";

type ReorderItem = {
  id: number;
  conversation_id: number;
  handoff_id: number;
  source_conversation_id?: number | null;
  source_handoff_id?: number | null;
  new_conversation_id?: number | null;
  new_handoff_id?: number | null;
  status: string;
  route_type: string;
  user_email?: string | null;
  user_note?: string | null;
  created_at?: string | null;
};

function statusBadge(status?: string | null) {
  const s = String(status || "").toLowerCase();
  const base = "rounded-full border px-3 py-1 text-xs font-semibold";
  if (s === "assigned") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "in_progress") return `${base} border-indigo-700/60 bg-indigo-500/10 text-indigo-200`;
  if (s === "closed") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

export default function AgentReordersPage() {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/internal/agent/reorders", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load reorders");
        if (active) setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load reorders");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function updateStatus(reorderId: number, action: "start" | "close") {
    setWorking((prev) => ({ ...prev, [reorderId]: true }));
    try {
      const res = await fetch("/api/internal/agent/reorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder_id: reorderId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update");
      setItems((prev) =>
        prev.map((item) =>
          item.id === reorderId ? { ...item, status: data.status } : item
        )
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to update");
    } finally {
      setWorking((prev) => ({ ...prev, [reorderId]: false }));
    }
  }

  return (
    <AgentAppShell title="Reorders" subtitle="Follow up on delivered projects that need re-ordering.">
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading reorders…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          No re-order requests assigned yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-900">
                    Reorder #{item.id}
                  </span>
                  <span className="text-xs text-neutral-500">
                    Original #{item.source_conversation_id || item.conversation_id}
                  </span>
                  {item.new_conversation_id ? (
                    <span className="text-xs text-neutral-500">
                      New #{item.new_conversation_id}
                    </span>
                  ) : null}
                  <span className={statusBadge(item.status)}>{item.status}</span>
                </div>
                <span className="text-xs text-neutral-500">{item.route_type}</span>
              </div>

              {item.user_note ? (
                <p className="mt-3 text-sm text-neutral-600">Customer note: {item.user_note}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {item.new_handoff_id || item.handoff_id ? (
                  <Link
                    href={`/agent-app/projects/${item.new_handoff_id || item.handoff_id}?conversation_id=${
                      item.new_conversation_id || item.conversation_id
                    }`}
                    className="btn btn-outline px-4 py-2 text-xs"
                  >
                    Open project
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "start")}
                  disabled={working[item.id] || item.status === "in_progress"}
                  className="btn btn-outline px-4 py-2 text-xs disabled:opacity-50"
                >
                  Mark in progress
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(item.id, "close")}
                  disabled={working[item.id] || item.status === "closed"}
                  className="btn btn-outline px-4 py-2 text-xs border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AgentAppShell>
  );
}
