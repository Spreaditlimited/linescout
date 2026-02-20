"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ConfirmModal from "../../_components/ConfirmModal";

type AgentDetail = {
  agent: {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    created_at: string;
    permissions: {
      can_view_leads: boolean;
      can_view_handoffs: boolean;
      can_view_analytics: boolean;
      claim_limit_override: number | null;
    };
    profile: {
      first_name: string | null;
      last_name: string | null;
      china_phone: string | null;
      china_phone_verified_at: string | null;
      china_city: string | null;
      nationality: string | null;
      nin: string | null;
      nin_verified_at: string | null;
      full_address: string | null;
      approval_status: string;
      approved_at: string | null;
      rejection_reason: string | null;
    };
    payout_account: {
      bank_code: string | null;
      account_number: string | null;
      account_name: string | null;
      status: string;
      verified_at: string | null;
    } | null;
    checklist: {
      phone_verified: boolean;
      nin_provided: boolean;
      nin_verified: boolean;
      bank_provided: boolean;
      bank_verified: boolean;
      address_provided: boolean;
    };
  };
  projects: Array<{
    handoff_id: number;
    conversation_id: number | null;
    status: string;
    handoff_type: string;
    customer_name: string;
    email: string;
    whatsapp_number: string;
    created_at: string | null;
    claimed_at: string | null;
    last_message_at: string | null;
    claim_hours: number | null;
    quote_count: number;
    latest_quote_id: number | null;
    latest_quote_at: string | null;
    reorder_count: number;
    points: number;
    points_max: number;
    verdict: string;
  }>;
  points_max: { total: number };
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function pill(ok: boolean) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  return ok
    ? `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`
    : `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
}

export default function AgentDetailsPage() {
  const params = useParams<{ id: string }>();
  const agentId = Number(params?.id || 0);
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [sending, setSending] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmHandoff, setConfirmHandoff] = useState<number | null>(null);
  const [confirmConversation, setConfirmConversation] = useState<number | null>(null);
  const [claimLimitOverride, setClaimLimitOverride] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const load = async () => {
    if (!agentId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/agents/${agentId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }
      setData(json);
      const limit = json?.agent?.permissions?.claim_limit_override;
      setClaimLimitOverride(limit == null ? "" : String(limit));
    } catch (e: any) {
      setErr(e?.message || "Failed to load agent.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [agentId]);

  const agent = data?.agent;
  const checklist = agent?.checklist;
  const projects = data?.projects || [];

  const name = useMemo(() => {
    const fn = agent?.profile?.first_name || "";
    const ln = agent?.profile?.last_name || "";
    const full = `${fn} ${ln}`.trim();
    return full || agent?.username || "Agent";
  }, [agent]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Agent details</h2>
        <p className="mt-1 text-sm text-neutral-400">Full visibility into agent profile and projects.</p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-4 text-sm text-neutral-400">
          Loading...
        </div>
      ) : agent ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Agent</p>
                <h3 className="mt-2 text-2xl font-semibold text-neutral-100">{name}</h3>
                <p className="mt-1 text-sm text-neutral-400">{agent.email || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={pill(agent.is_active)}>Active: {agent.is_active ? "Yes" : "No"}</span>
                <span className={pill(agent.permissions.can_view_handoffs)}>Approved: {agent.permissions.can_view_handoffs ? "Yes" : "No"}</span>
                <span className={pill(checklist?.phone_verified || false)}>Phone: {checklist?.phone_verified ? "Yes" : "No"}</span>
                <span className={pill(checklist?.bank_verified || false)}>Bank: {checklist?.bank_verified ? "Yes" : "No"}</span>
                <span className={pill(checklist?.nin_provided || false)}>NIN: {checklist?.nin_provided ? "Yes" : "No"}</span>
                <span className={pill(checklist?.address_provided || false)}>Address: {checklist?.address_provided ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm text-neutral-300">
              <div>China phone: <span className="text-neutral-100">{agent.profile.china_phone || "—"}</span></div>
              <div>China city: <span className="text-neutral-100">{agent.profile.china_city || "—"}</span></div>
              <div>Nationality: <span className="text-neutral-100">{agent.profile.nationality || "—"}</span></div>
              <div>NIN: <span className="text-neutral-100">{agent.profile.nin || "—"}</span></div>
              <div>Address: <span className="text-neutral-100">{agent.profile.full_address || "—"}</span></div>
              <div>Approval: <span className="text-neutral-100">{agent.profile.approval_status || "pending"}</span></div>
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Claim Limit Override
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={claimLimitOverride}
                  onChange={(e) => setClaimLimitOverride(e.target.value)}
                  placeholder="Blank = use global"
                  className="w-44 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setSavingLimit(true);
                    setMsg(null);
                    try {
                      const raw = claimLimitOverride.trim();
                      const payload =
                        raw === "" ? { claim_limit_override: null } : { claim_limit_override: Number(raw) };
                      const res = await fetch(`/api/internal/admin/agents/${agentId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok || !json?.ok) {
                        throw new Error(json?.error || "Failed to save override.");
                      }
                      setMsg("Claim limit override saved.");
                      await load();
                    } catch (e: any) {
                      setMsg(e?.message || "Failed to save override.");
                    } finally {
                      setSavingLimit(false);
                    }
                  }}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                  disabled={savingLimit}
                >
                  {savingLimit ? "Saving..." : "Save"}
                </button>
                <div className="text-xs text-neutral-400">
                  Set a numeric limit (1–100) to override the global cap.
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Message agent</h3>
                <p className="mt-1 text-xs text-neutral-400">Sends in-app notification, email, and push.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Title"
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
              />
              <input
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Message"
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
              />
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={async () => {
                  if (!noteTitle.trim() || !noteBody.trim()) {
                    setMsg("Title and message are required.");
                    return;
                  }
                  setSending(true);
                  setMsg(null);
                  const res = await fetch("/api/internal/notifications/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      target: "agent",
                      audience: "single",
                      recipient_id: agent.id,
                      title: noteTitle.trim(),
                      body: noteBody.trim(),
                    }),
                  });
                  const json = await res.json().catch(() => null);
                  setSending(false);
                  if (!res.ok || !json?.ok) {
                    setMsg(json?.error || "Failed to send notification.");
                    return;
                  }
                  setNoteTitle("");
                  setNoteBody("");
                  setMsg("Message sent.");
                }}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                disabled={sending}
              >
                {sending ? "Sending..." : "Send message"}
              </button>
              {msg ? <div className="mt-2 text-xs text-neutral-400">{msg}</div> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Projects</h3>
                <p className="mt-1 text-xs text-neutral-400">
                  Paid chats and handoffs assigned to this agent.
                </p>
              </div>
            </div>
            {projects.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-400">No projects assigned.</div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Handoff</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Claim time (hrs)</th>
                      <th className="px-3 py-2 text-left">Quotes</th>
                      <th className="px-3 py-2 text-left">Reorders</th>
                      <th className="px-3 py-2 text-left">Score</th>
                      <th className="px-3 py-2 text-left">Verdict</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {projects.map((p) => (
                      <tr key={p.handoff_id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-neutral-100">#{p.handoff_id}</td>
                        <td className="px-3 py-2 text-neutral-200">{p.customer_name || "—"}</td>
                        <td className="px-3 py-2 text-neutral-200">{p.status || "—"}</td>
                        <td className="px-3 py-2 text-neutral-200">
                          {p.claim_hours != null ? p.claim_hours.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-neutral-200">{p.quote_count}</td>
                        <td className="px-3 py-2 text-neutral-200">{p.reorder_count}</td>
                        <td className="px-3 py-2 text-neutral-200">
                          {p.points}/{p.points_max || "—"}
                        </td>
                        <td className="px-3 py-2 text-neutral-200">{p.verdict}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <a
                            href={`/internal/agent-handoffs/${p.handoff_id}`}
                            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                          >
                            Open
                          </a>
                          {p.conversation_id ? (
                            <button
                              className="ml-2 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200 hover:border-red-700/70"
                              onClick={() => {
                                setConfirmHandoff(p.handoff_id);
                                setConfirmConversation(p.conversation_id);
                                setConfirmOpen(true);
                              }}
                            >
                              Reclaim
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmOpen}
        title="Reclaim project?"
        description="This will release the project back to the unclaimed pool."
        confirmText="Yes, reclaim"
        cancelText="Cancel"
        danger
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmHandoff(null);
          setConfirmConversation(null);
        }}
        onConfirm={async () => {
          const convoId = confirmConversation || 0;
          if (!convoId) return;
          setConfirmOpen(false);
          setConfirmHandoff(null);
          setConfirmConversation(null);
          const res = await fetch("/api/internal/paid-chat/unclaim", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ conversation_id: convoId }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok) {
            setMsg(json?.error || "Failed to reclaim project.");
            return;
          }
          await load();
        }}
      />
    </div>
  );
}
