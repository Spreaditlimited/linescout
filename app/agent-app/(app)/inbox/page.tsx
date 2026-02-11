"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AgentAppShell from "../_components/AgentAppShell";

type InboxItem = {
  conversation_id?: number;
  id?: number;
  handoff_id?: number | null;
  handoff_status?: string | null;
  assigned_agent_id?: number | null;
  customer_name?: string | null;
  email?: string | null;
  route_type?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  is_unread?: number | boolean | null;
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

export default function InboxPage() {
  const [tab, setTab] = useState<"paid" | "quick">("paid");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);

  const [paid, setPaid] = useState<InboxItem[]>([]);
  const [quick, setQuick] = useState<InboxItem[]>([]);
  const [selfId, setSelfId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);

      const [paidRes, quickRes, meRes] = await Promise.all([
        fetch("/api/internal/paid-chat/inbox?limit=80&cursor=0&scope=all&kind=paid", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/internal/paid-chat/inbox?limit=80&cursor=0&kind=quick_human", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" }),
      ]);

      const paidJson = await paidRes.json().catch(() => ({}));
      const quickJson = await quickRes.json().catch(() => ({}));
      const meJson = await meRes.json().catch(() => ({}));

      if (paidRes.ok && paidJson?.ok) setPaid(Array.isArray(paidJson.items) ? paidJson.items : []);
      if (quickRes.ok && quickJson?.ok) setQuick(Array.isArray(quickJson.items) ? quickJson.items : []);
      if (meRes.ok && meJson?.ok && meJson?.user?.id) setSelfId(Number(meJson.user.id));

      if ((!paidRes.ok || !paidJson?.ok) && (!quickRes.ok || !quickJson?.ok)) {
        const requiresApproval =
          paidJson?.approval_required ||
          quickJson?.approval_required ||
          String(paidJson?.error || "") === "ACCOUNT_APPROVAL_REQUIRED" ||
          String(quickJson?.error || "") === "ACCOUNT_APPROVAL_REQUIRED";
        setApprovalRequired(Boolean(requiresApproval));
        setErr(
          paidJson?.message ||
            quickJson?.message ||
            paidJson?.error ||
            quickJson?.error ||
            "Could not load inbox."
        );
      } else {
        setApprovalRequired(false);
      }
    } catch (e: any) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const claimChat = useCallback(
    async (conversationId: number) => {
      try {
        const res = await fetch("/api/internal/paid-chat/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({ conversation_id: conversationId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          setErr(String(json?.error || `Failed (${res.status})`));
          return;
        }
        await load();
      } catch (e: any) {
        setErr(e?.message || "Failed to claim chat.");
      }
    },
    [load]
  );

  const items = tab === "paid" ? paid : quick;

  const emptyState = tab === "paid"
    ? "No paid chats yet. When projects are assigned, they show here."
    : "No quick human chats yet. They will appear here when live.";

  const title = "Inbox";
  const subtitle = "Claim paid chats, reply fast, and keep handoffs moving.";

  return (
    <AgentAppShell title={title} subtitle={subtitle}>
      <div className="flex flex-wrap items-center gap-2">
        {(["paid", "quick"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                active
                  ? "bg-[#2D3461] text-white"
                  : "border border-[rgba(45,52,97,0.2)] bg-white text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              }`}
            >
              {t === "paid" ? "Paid chats" : "Quick human"}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onRefresh}
          className="ml-auto rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

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
        <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-3 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4">
          Loading inbox…
        </div>
      ) : items.length === 0 && !approvalRequired ? (
        <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-3 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4">
          {emptyState}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {items.map((c) => {
            const conversationId = Number(c.conversation_id || c.id || 0);
            const unread = Boolean(c.is_unread);
            const name = getDisplayFirstName(c.customer_name);
            const routeLabel = getRouteLabel(c.route_type);
            const last = String(c.last_message_text || "").trim();
            const ago = timeAgoSafe(c.last_message_at);
            const handoffStatus = String(c.handoff_status || "").trim().toLowerCase();
            const assignedId = Number(c.assigned_agent_id || 0);
            const canClaim =
              tab === "paid" &&
              conversationId > 0 &&
              !assignedId &&
              (!handoffStatus || handoffStatus === "pending");
            const assignedToMe = assignedId > 0 && selfId && assignedId === selfId;
            const blocked = assignedId > 0 && selfId && assignedId !== selfId;

            return (
              <div
                key={`${tab}-${conversationId}`}
                className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {name} · {routeLabel}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {unread ? "Unread" : "Last update"} {ago ? `· ${ago}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversationId > 0 ? (
                      <Link
                        href={`/agent-app/inbox/${conversationId}?kind=${tab}`}
                        className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                      >
                        Open chat
                      </Link>
                    ) : null}
                    {assignedToMe ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                        Assigned to you
                      </span>
                    ) : null}
                    {blocked ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                        Assigned
                      </span>
                    ) : null}
                    {canClaim ? (
                      <button
                        type="button"
                        onClick={() => claimChat(conversationId)}
                        className="rounded-full bg-[#2D3461] px-3 py-1 text-xs font-semibold text-white"
                      >
                        Claim
                      </button>
                    ) : null}
                  </div>
                </div>

                {last ? (
                  <p className="mt-3 text-sm text-neutral-600">{last}</p>
                ) : (
                  <p className="mt-3 text-sm text-neutral-400">No messages yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AgentAppShell>
  );
}
