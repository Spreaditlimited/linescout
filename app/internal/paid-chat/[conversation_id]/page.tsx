"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ConfirmModal from "../../_components/ConfirmModal";
import SearchableSelect from "../../_components/SearchableSelect";

type MeRes =
  | {
      ok: true;
      user: {
        id: number;
        username: string;
        role: "admin" | "agent";
      };
    }
  | { ok: false; error: string };

type AgentRow = {
  id: number;
  username: string;
  email: string | null;
  is_active: number;
  approval_status: string | null;
};

type Msg = {
  id: number;
  conversation_id: number;
  sender_type: "user" | "ai" | "agent";
  sender_id: number | null;
  message_text: string;
  reply_to_message_id?: number | null;
  reply_to_sender_type?: "user" | "agent" | "ai" | string | null;
  reply_to_text?: string | null;
  created_at: string;
};

type MsgRes = {
  ok: boolean;
  conversation_id: number;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;
  agent_name_map?: Record<string, string>;
  admin_sender_ids?: number[];
  meta?: {
    customer_name?: string | null;
  };
  items: Msg[];
  last_id: number;
  error?: string;
};

type SendRes = {
  ok: boolean;
  item?: Msg | null;
  error?: string;
};

type ClaimRes = {
  ok: boolean;
  conversation_id: number;
  assigned_agent_id: number | null;
  assigned_agent_username?: string | null;
  claimed?: boolean;
  already_assigned?: boolean;
  taken_over?: boolean;
  error?: string;
};

type AssignRes = {
  ok: boolean;
  conversation_id: number;
  assigned_agent_id: number | null;
  assigned_agent_username?: string | null;
  error?: string;
};

const URL_RE = /(https?:\/\/[^\s]+)/g;

function fmtTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function renderMessageWithLinks(text: string) {
  return String(text || "")
    .split(URL_RE)
    .map((chunk, idx) => {
      if (/^https?:\/\//i.test(chunk)) {
        const isQuote = /\/quote\/[A-Za-z0-9_-]+/i.test(chunk);
        return (
          <a
            key={`${idx}-${chunk}`}
            href={chunk}
            target="_blank"
            rel="noreferrer"
            className={
              isQuote
                ? "inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-neutral-200"
                : "underline underline-offset-2 hover:opacity-80"
            }
          >
            {isQuote ? "Open Quote" : chunk}
          </a>
        );
      }
      return <span key={`${idx}-${chunk}`}>{chunk}</span>;
    });
}

export default function PaidChatThreadPage() {
  const params = useParams<{ conversation_id: string }>();
  const conversationId = Number(params?.conversation_id || 0);

  const [bootErr, setBootErr] = useState<string | null>(null);

  const [items, setItems] = useState<Msg[]>([]);
  const [lastId, setLastId] = useState<number>(0);
  const lastIdRef = useRef<number>(0);

  const [me, setMe] = useState<MeRes | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [claimNote, setClaimNote] = useState<string>("");

  const [assignedAgentId, setAssignedAgentId] = useState<number | null>(null);
  const [assignedAgentUsername, setAssignedAgentUsername] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [adminSenderIds, setAdminSenderIds] = useState<number[]>([]);

  const [takeoverConfirmOpen, setTakeoverConfirmOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverTarget, setHandoverTarget] = useState("");
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverNote, setHandoverNote] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const canSend = useMemo(() => !!input.trim() && !sending, [input, sending]);
  const authed = !!(me && "ok" in me && me.ok);
  const myId = authed ? (me as any).user.id : null;
  const myRole = authed ? ((me as any).user.role as "admin" | "agent") : null;
  const isAdmin = myRole === "admin";

  const activeAgents = useMemo(
    () =>
      agents.filter(
        (a) => Number(a.is_active ?? 1) === 1 && String(a.approval_status || "") === "approved"
      ),
    [agents]
  );

  useEffect(() => {
    lastIdRef.current = lastId;
  }, [lastId]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }

  async function fetchNew(after: number): Promise<{
    rows: Msg[];
    last: number;
    assigned_agent_id: number | null;
    assigned_agent_username: string | null;
    customer_name: string | null;
    agent_name_map: Record<string, string>;
    admin_sender_ids: number[];
  }> {
    const res = await fetch(
      `/api/internal/paid-chat/messages?conversation_id=${conversationId}&after_id=${after}&limit=120`,
      { method: "GET" }
    );

    const data: MsgRes | null = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Failed (${res.status})`);
    }

    const rows = Array.isArray(data.items) ? data.items : [];
    const last = Number(data.last_id || after);

    const assigned_agent_id =
      typeof data.assigned_agent_id === "number" ? data.assigned_agent_id : null;

    const assigned_agent_username =
      typeof data.assigned_agent_username === "string" && data.assigned_agent_username.trim()
        ? data.assigned_agent_username.trim()
        : null;

    const customer_name =
      typeof data?.meta?.customer_name === "string" && data.meta.customer_name.trim()
        ? data.meta.customer_name.trim()
        : null;
    const agent_name_map =
      typeof data?.agent_name_map === "object" && data.agent_name_map ? data.agent_name_map : {};
    const admin_sender_ids = Array.isArray(data?.admin_sender_ids)
      ? data.admin_sender_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

    return {
      rows,
      last,
      assigned_agent_id,
      assigned_agent_username,
      customer_name,
      agent_name_map,
      admin_sender_ids,
    };
  }

  async function loadMe() {
    try {
      const res = await fetch("/internal/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as MeRes | null;
      if (data) setMe(data);
      else setMe({ ok: false, error: "Failed to load session" });
    } catch {
      setMe({ ok: false, error: "Failed to load session" });
    }
  }

  async function loadAgents() {
    setAgentsLoading(true);
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
      setAgents(mapped);
    } catch {
      // silent
    } finally {
      setAgentsLoading(false);
    }
  }

  async function claimConversation() {
    const res = await fetch("/api/internal/paid-chat/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId }),
    });

    const data: ClaimRes | null = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setClaimNote(data?.error || `Claim failed (${res.status})`);
      return;
    }

    setAssignedAgentId(typeof data.assigned_agent_id === "number" ? data.assigned_agent_id : null);

    const uname =
      typeof data.assigned_agent_username === "string" && data.assigned_agent_username.trim()
        ? data.assigned_agent_username.trim()
        : null;
    if (uname) setAssignedAgentUsername(uname);

    if (data.taken_over) setClaimNote("Taken over by admin.");
    else if (data.claimed) setClaimNote("Assigned to you.");
    else if (data.already_assigned) setClaimNote("Already assigned.");
    else setClaimNote("");
  }

  async function handoverConversation() {
    if (!handoverTarget) {
      setHandoverNote("Select an agent or return to pool.");
      return;
    }

    setHandoverNote("");
    setHandoverBusy(true);

    try {
      if (handoverTarget === "pool") {
        const res = await fetch("/api/internal/paid-chat/unclaim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setHandoverNote(data?.error || `Release failed (${res.status})`);
          return;
        }
        setAssignedAgentId(null);
        setAssignedAgentUsername(null);
        setClaimNote("Returned to pool.");
        setHandoverOpen(false);
        return;
      }

      const agentId = Number(handoverTarget || 0);
      if (!agentId) {
        setHandoverNote("Select a valid agent.");
        return;
      }

      const res = await fetch("/api/internal/paid-chat/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, agent_id: agentId }),
      });
      const data: AssignRes | null = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setHandoverNote(data?.error || `Assign failed (${res.status})`);
        return;
      }

      const picked = activeAgents.find((a) => Number(a.id) === agentId) || null;
      setAssignedAgentId(typeof data?.assigned_agent_id === "number" ? data.assigned_agent_id : agentId);
      setAssignedAgentUsername(
        (typeof data?.assigned_agent_username === "string" && data.assigned_agent_username.trim()) ||
          (picked?.username ? picked.username : null)
      );
      setClaimNote("Assigned by admin.");
      setHandoverOpen(false);
    } catch {
      setHandoverNote("Network error");
    } finally {
      setHandoverBusy(false);
    }
  }

  // Boot: initial load + start polling
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    (async () => {
      try {
        setBootErr(null);

        const initial = await fetchNew(0);
        if (cancelled) return;

        setAssignedAgentId(initial.assigned_agent_id);
        setAssignedAgentUsername(initial.assigned_agent_username);
        setCustomerName(initial.customer_name);
        setAgentNameMap(initial.agent_name_map || {});
        setAdminSenderIds(initial.admin_sender_ids || []);

        setItems(initial.rows);
        setLastId(initial.last);
        setTimeout(scrollToBottom, 50);
      } catch (e: any) {
        if (!cancelled) setBootErr(e?.message || "Failed to load.");
      }
    })();

    pollRef.current = window.setInterval(async () => {
      try {
        const after = lastIdRef.current || 0;

        const {
          rows,
          last,
          assigned_agent_id,
          assigned_agent_username,
          customer_name,
          agent_name_map,
          admin_sender_ids,
        } =
          await fetchNew(after);

        // always keep assignment fresh
        setAssignedAgentId(assigned_agent_id);
        setAssignedAgentUsername(assigned_agent_username);
        if (customer_name) setCustomerName(customer_name);
        if (agent_name_map && Object.keys(agent_name_map).length) {
          setAgentNameMap((prev) => ({ ...prev, ...agent_name_map }));
        }
        if (admin_sender_ids.length) {
          setAdminSenderIds((prev) => {
            const merged = new Set<number>([...prev, ...admin_sender_ids]);
            return Array.from(merged);
          });
        }

        if (!rows.length) return;

        setItems((prev) => {
          const incoming = rows || [];
          const incomingKeys = new Set(
            incoming.map(
              (r) => `${r.sender_type}|${String(r.message_text || "").trim()}|${Number(r.reply_to_message_id || 0)}`
            )
          );
          const cleanedPrev = prev.filter((m) => {
            const isOptimistic = m.id > 1000000000000;
            if (!isOptimistic) return true;
            const key = `${m.sender_type}|${String(m.message_text || "").trim()}|${Number(
              m.reply_to_message_id || 0
            )}`;
            return !incomingKeys.has(key);
          });

          const seen = new Set(cleanedPrev.map((m) => m.id));
          const merged = [...cleanedPrev];
          for (const r of rows) {
            if (!seen.has(r.id)) merged.push(r);
          }
          return merged;
        });

        setLastId(last);
        scrollToBottom();
      } catch {
        // silent
      }
    }, 1200);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function send() {
    const text = input.trim();
    if (!text || !canSend) return;

    setSending(true);
    setInput("");

    const optimisticId = Date.now() * 1000;
    const optimistic: Msg = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: null,
      message_text: text,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      const res = await fetch("/api/internal/paid-chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, message_text: text }),
      });

      const data: SendRes | null = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.item) {
        setItems((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, message_text: m.message_text + "\n\n(Delivery failed)" }
              : m
          )
        );
        return;
      }

      setItems((prev) => {
        const next = prev.map((m) => (m.id === optimisticId ? data.item! : m));
        const seen = new Set<number>();
        return next.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      });

      const realId = Number(data.item.id || 0);
      if (realId > lastIdRef.current) {
        lastIdRef.current = realId;
        setLastId(realId);
      }

      scrollToBottom();
    } catch {
      setItems((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, message_text: m.message_text + "\n\n(Network error)" }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  const assignmentLine = assignedAgentUsername
    ? `Assigned to: ${assignedAgentUsername}${assignedAgentId ? ` (#${assignedAgentId})` : ""}`
    : assignedAgentId
      ? `Assigned agent ID: ${assignedAgentId}`
      : "Unassigned";

  const showTakeover =
    isAdmin &&
    assignedAgentId != null &&
    myId != null &&
    Number(assignedAgentId) !== Number(myId);

  return (
    <div className="min-h-[100dvh] bg-[#0B0B0E] text-neutral-100 flex flex-col">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/60 backdrop-blur px-3 sm:px-4 py-3 flex items-center gap-3">
        <Link
          href="/internal/paid-chat"
          className="shrink-0 text-sm font-semibold text-white/80 hover:text-white"
        >
          Back
        </Link>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {customerName ? `${customerName} • #${conversationId}` : `Conversation #${conversationId}`}
          </div>
          <div className="mt-0.5 text-[11px] text-white/50 truncate">
            {assignmentLine}
            {claimNote ? ` • ${claimNote}` : ""}
          </div>
        </div>

        {isAdmin ? (
          <div className="ml-auto shrink-0 flex items-center gap-2">
            {showTakeover ? (
              <button
                onClick={() => setTakeoverConfirmOpen(true)}
                className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-1.5 text-[11px] font-semibold text-red-200"
              >
                Take over
              </button>
            ) : null}
            <button
              onClick={() => {
                setHandoverNote("");
                setHandoverTarget("");
                setHandoverOpen(true);
              }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 text-[11px] font-semibold text-neutral-200"
            >
              Hand over
            </button>
            <div className="text-[11px] text-white/50">Admin view</div>
          </div>
        ) : (
          <div className="ml-auto shrink-0 text-[11px] text-white/50">Agent view</div>
        )}
      </div>

      {bootErr ? (
        <div className="p-4">
          <div className="rounded-2xl border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-200">
            {bootErr}
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 sm:px-4 py-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="mx-auto w-full max-w-3xl space-y-3">
              {items.map((m) => {
                const isAgent = m.sender_type === "agent";
                const senderIdNum = Number(m.sender_id || 0);
                const isAdminSender = isAgent && senderIdNum > 0 && adminSenderIds.includes(senderIdNum);
                const bubble = isAgent
                  ? isAdminSender
                    ? "ml-auto border border-amber-300/70 bg-amber-100 text-amber-950"
                    : "ml-auto bg-white text-neutral-950"
                  : "mr-auto bg-white/[0.06] border border-white/10 text-white";

                const metaColor = isAgent
                  ? isAdminSender
                    ? "text-amber-900/70"
                    : "text-black/50"
                  : "text-white/50";
                const senderIdKey = senderIdNum > 0 ? String(senderIdNum) : "";
                const agentLabel = senderIdKey && agentNameMap[senderIdKey] ? agentNameMap[senderIdKey] : "Agent";
                const label =
                  m.sender_type === "ai"
                    ? "AI"
                    : m.sender_type === "user"
                      ? "Customer"
                      : isAdminSender
                        ? "Admin"
                        : agentLabel;

                return (
                  <div
                    key={String(m.id)}
                    className={`w-fit max-w-[92%] sm:max-w-[86%] rounded-2xl px-3 py-2 ${bubble}`}
                  >
                    <div className={`text-[11px] ${metaColor} mb-1`}>
                      {label} • {fmtTime(m.created_at)}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                      {renderMessageWithLinks(m.message_text)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur p-2 sm:p-3">
            <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="min-h-[46px] max-h-[160px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              />

              <button
                onClick={send}
                disabled={!canSend}
                className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={takeoverConfirmOpen}
        title="Take over this conversation?"
        description="This will assign the conversation to you and notify the customer."
        confirmText="Take over"
        onCancel={() => setTakeoverConfirmOpen(false)}
        onConfirm={async () => {
          await claimConversation();
          setTakeoverConfirmOpen(false);
        }}
      />

      {handoverOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0B0E] p-4">
            <div className="text-sm font-semibold text-white">Hand over conversation</div>
            <div className="mt-1 text-xs text-white/60">
              Assign to a specific agent or return this chat to the pool.
            </div>

            <div className="mt-4 space-y-2">
              <SearchableSelect
                value={handoverTarget}
                options={[
                  { value: "", label: "Select agent or action" },
                  { value: "pool", label: "Return to pool" },
                  ...activeAgents.map((agent) => ({
                    value: String(agent.id),
                    label: agent.username || `Agent ${agent.id}`,
                  })),
                ]}
                onChange={(next) => setHandoverTarget(next)}
                className="w-full"
              />

              {agentsLoading ? (
                <div className="text-xs text-white/50">Loading agents…</div>
              ) : null}

              {handoverNote ? (
                <div className="text-xs text-red-200">{handoverNote}</div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setHandoverOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handoverConversation}
                disabled={handoverBusy}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-60"
              >
                {handoverBusy ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
