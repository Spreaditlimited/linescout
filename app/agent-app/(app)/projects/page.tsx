"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AgentAppShell from "../_components/AgentAppShell";
import ConfirmModal from "@/components/ConfirmModal";

type ProjectItem = {
  conversation_id: number;
  handoff_id: number | null;
  handoff_status?: string | null;
  assigned_agent_id?: number | null;
  customer_name?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
  route_type?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
};

function timeAgoSafe(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return "";
  const diff = Math.max(Date.now() - t, 0);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function getDisplayFirstName(fullName?: string | null) {
  const raw = String(fullName || "").trim();
  if (raw) return raw.split(/\s+/)[0] || "Customer";
  return "Customer";
}

function getRouteLabel(route?: string | null) {
  if (route === "white_label") return "White Label";
  if (route === "simple_sourcing") return "Simple Sourcing";
  if (route === "machine_sourcing") return "Machine Sourcing";
  return "General";
}

function statusLabel(raw?: string | null) {
  const s = String(raw || "pending").trim().toLowerCase();
  if (s === "manufacturer_found") return "Manufacturer Found";
  return s.replace(/_/g, " ").replace(/\w/g, (m) => m.toUpperCase());
}

export default function ProjectsPage() {
  const [tab, setTab] = useState<"unclaimed" | "mine">("unclaimed");
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [query, setQuery] = useState("");
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [confirmReleaseId, setConfirmReleaseId] = useState<number | null>(null);

  const load = useCallback(
    async (scopeOverride?: "unclaimed" | "mine") => {
      try {
        setErr(null);
        setLoading(true);
        const scope = scopeOverride || tab;
        const res = await fetch(
          `/api/internal/paid-chat/inbox?limit=80&cursor=0&kind=paid&scope=${scope}`,
          { cache: "no-store", credentials: "include" }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          const requiresApproval =
            json?.approval_required || String(json?.error || "") === "ACCOUNT_APPROVAL_REQUIRED";
          setApprovalRequired(Boolean(requiresApproval));
          setErr(String(json?.message || json?.error || `Failed (${res.status})`));
          setItems([]);
          return;
        }
        setItems(Array.isArray(json.items) ? json.items : []);
        setApprovalRequired(false);
      } catch (e: any) {
        setErr(e?.message || "Network error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    load(tab);
  }, [load, tab]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = String(item.customer_name || "").toLowerCase();
      const status = String(item.handoff_status || "").toLowerCase();
      const route = String(item.route_type || "").toLowerCase();
      const last = String(item.last_message_text || "").toLowerCase();
      return name.includes(q) || status.includes(q) || route.includes(q) || last.includes(q);
    });
  }, [items, query]);

  const total = items.length;
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setVisibleCount(Math.min(filtered.length, 12));
  }, [filtered.length, tab, query]);

  useEffect(() => {
    if (visibleCount >= filtered.length) return;

    let cancelled = false;
    const step = 12;

    const schedule = () => {
      const cb = () => {
        if (cancelled) return;
        setVisibleCount((prev) => Math.min(prev + step, filtered.length));
      };

      if (typeof (window as any).requestIdleCallback === "function") {
        (window as any).requestIdleCallback(cb, { timeout: 1200 });
      } else {
        setTimeout(cb, 1200);
      }
    };

    schedule();
    return () => {
      cancelled = true;
    };
  }, [visibleCount, filtered.length]);

  return (
    <AgentAppShell title="Projects" subtitle="Track paid handoffs, milestones, and delivery timelines.">
      <section className="rounded-3xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-2 py-1 text-xs font-semibold text-[#2D3461]">
            {tab === "unclaimed" ? "Unclaimed projects" : "My projects"}
          </div>
          <div className="text-xs text-neutral-500">{total} project{total === 1 ? "" : "s"}</div>
          <button
            type="button"
            onClick={onRefresh}
            className="ml-auto rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-[rgba(45,52,97,0.2)] bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("unclaimed")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                tab === "unclaimed" ? "bg-[#2D3461] text-white" : "text-[#2D3461]"
              }`}
            >
              Unclaimed
            </button>
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                tab === "mine" ? "bg-[#2D3461] text-white" : "text-[#2D3461]"
              }`}
            >
              My projects
            </button>
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer, status, or route…"
              className="w-full rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm text-neutral-700 outline-none focus:border-[#2D3461]"
            />
          </div>
        </div>
      </section>

      {err ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div>{err}</div>
          {approvalRequired ? (
            <Link
              href="/agent-app/settings"
              className="mt-3 inline-flex rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Go to settings
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading projects…
        </div>
      ) : filtered.length === 0 && !approvalRequired ? (
        <div className="mt-4 rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          {tab === "unclaimed"
            ? "When projects are available to claim, they show up here."
            : "Your claimed projects will show here."}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {filtered.slice(0, visibleCount).map((item) => {
            const name = getDisplayFirstName(item.customer_name);
            const routeLabel = getRouteLabel(item.route_type);
            const status = statusLabel(item.handoff_status);
            const ago = timeAgoSafe(item.last_message_at);
            const canClaim = !item.assigned_agent_id && tab === "unclaimed" && item.conversation_id;
            const canRelease =
              tab === "mine" &&
              !!item.assigned_agent_id &&
              !!item.conversation_id &&
              ["pending", "manufacturer_found", ""].includes(
                String(item.handoff_status || "pending").toLowerCase()
              );
            const releaseDisabledReason =
              tab !== "mine"
                ? "Only your claimed projects can be released."
                : !item.assigned_agent_id
                ? "Only the assigned agent can release this project."
                : !item.conversation_id
                ? "Missing conversation details."
                : ["pending", "manufacturer_found", ""].includes(
                    String(item.handoff_status || "pending").toLowerCase()
                  )
                ? null
                : "Release is allowed only at Pending or Manufacturer Found.";
            const handoffId = item.handoff_id || 0;

            return (
              <div
                key={`${item.conversation_id}-${handoffId}`}
                className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-neutral-900">{name}</p>
                      <span className="rounded-full border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-xs font-semibold text-[#2D3461]">
                        {routeLabel}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      Last update {ago ? `· ${ago}` : ""}
                    </p>
                    {item.last_message_text ? (
                      <p className="mt-3 text-sm text-neutral-600">{item.last_message_text}</p>
                    ) : (
                      <p className="mt-3 text-sm text-neutral-400">No message preview available.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {handoffId ? (
                      <Link
                        href={`/agent-app/projects/${handoffId}?conversation_id=${item.conversation_id || 0}&mine=${tab === "mine" ? 1 : 0}`}
                        className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                      >
                        Open details
                      </Link>
                    ) : null}
                    {canClaim ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch("/api/internal/paid-chat/claim", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Accept: "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ conversation_id: item.conversation_id }),
                          });
                          const json = await res.json().catch(() => null);
                          if (!res.ok || !json?.ok) {
                            setErr(String(json?.error || `Failed (${res.status})`));
                            return;
                          }
                          await load(tab);
                        }}
                        className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
                      >
                        Claim project
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (!canRelease) return;
                        setConfirmReleaseId(item.conversation_id || null);
                      }}
                      disabled={!canRelease || releasingId === item.conversation_id}
                      title={!canRelease ? releaseDisabledReason || "Release not available." : ""}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                        canRelease
                          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          : "border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed"
                      }`}
                    >
                      {releasingId === item.conversation_id ? "Releasing…" : "Release project"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={confirmReleaseId != null}
        variant="light"
        title="Release project?"
        description="This will return the project to the unclaimed pool so another agent can take it."
        confirmText="Yes, release"
        cancelText="Cancel"
        danger
        onCancel={() => setConfirmReleaseId(null)}
        onConfirm={async () => {
          const convoId = confirmReleaseId || 0;
          if (!convoId) return;
          setReleasingId(convoId);
          setConfirmReleaseId(null);
          const res = await fetch("/api/internal/paid-chat/unclaim", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            credentials: "include",
            body: JSON.stringify({ conversation_id: convoId }),
          });
          const json = await res.json().catch(() => null);
          setReleasingId(null);
          if (!res.ok || !json?.ok) {
            setErr(String(json?.error || `Failed (${res.status})`));
            return;
          }
          await load(tab);
        }}
      />
    </AgentAppShell>
  );
}
