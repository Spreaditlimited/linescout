"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AgentAppShell from "../../_components/AgentAppShell";

type Msg = {
  id: number;
  conversation_id: number;
  sender_type: "user" | "ai" | "agent";
  sender_id: number | null;
  message_text: string;
  created_at: string;
};

type MsgRes = {
  ok: boolean;
  conversation_id: number;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;
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
                ? "inline-flex items-center rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-3 py-1 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
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

function AgentChatThreadInner() {
  const params = useParams<{ conversation_id: string }>();
  const searchParams = useSearchParams();
  const conversationId = Number(params?.conversation_id || 0);
  const kind = String(searchParams.get("kind") || "paid");

  const [bootErr, setBootErr] = useState<string | null>(null);
  const [items, setItems] = useState<Msg[]>([]);
  const [lastId, setLastId] = useState<number>(0);
  const lastIdRef = useRef<number>(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [claimNote, setClaimNote] = useState<string>("");
  const [assignedAgentId, setAssignedAgentId] = useState<number | null>(null);
  const [assignedAgentUsername, setAssignedAgentUsername] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const canSend = useMemo(() => !!input.trim() && !sending, [input, sending]);

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
  }> {
    const res = await fetch(
      `/api/internal/paid-chat/messages?conversation_id=${conversationId}&after_id=${after}&limit=120`,
      { method: "GET", credentials: "include" }
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

    return { rows, last, assigned_agent_id, assigned_agent_username };
  }

  async function claimConversation() {
    if (kind === "quick") {
      setClaimNote("Quick chat");
      return;
    }
    const res = await fetch("/api/internal/paid-chat/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    (async () => {
      try {
        setBootErr(null);
        await claimConversation();
        const initial = await fetchNew(0);
        if (cancelled) return;

        setAssignedAgentId(initial.assigned_agent_id);
        setAssignedAgentUsername(initial.assigned_agent_username);

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

        const { rows, last, assigned_agent_id, assigned_agent_username } =
          await fetchNew(after);

        setAssignedAgentId(assigned_agent_id);
        setAssignedAgentUsername(assigned_agent_username);

        if (!rows.length) return;

        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
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
    }, 1400);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [conversationId, kind]);

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
        credentials: "include",
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

      setItems((prev) => prev.map((m) => (m.id === optimisticId ? data.item! : m)));

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

  const title = kind === "quick" ? "Quick chat" : "Paid chat";
  const subtitle = `Conversation #${conversationId || "—"}`;

  return (
    <AgentAppShell title={title} subtitle={subtitle}>
      <div className="flex h-[70vh] min-h-[520px] max-h-[74vh] flex-col rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="border-b border-[rgba(45,52,97,0.12)] px-4 py-3">
          <p className="text-xs text-neutral-500">
            {assignmentLine}
            {claimNote ? ` • ${claimNote}` : ""}
          </p>
        </div>

        {bootErr ? (
          <div className="p-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {bootErr}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mx-auto w-full max-w-3xl space-y-3">
                {items.map((m) => {
                  const isAgent = m.sender_type === "agent";
                  const bubble = isAgent
                    ? "ml-auto bg-[#2D3461] text-white"
                    : "mr-auto bg-[#F4F7FB] text-neutral-800 border border-[rgba(45,52,97,0.12)]";

                  const metaColor = isAgent ? "text-white/70" : "text-neutral-500";
                  const label =
                    m.sender_type === "ai" ? "AI" : m.sender_type === "user" ? "Customer" : "You";

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

            <div className="border-t border-[rgba(45,52,97,0.12)] px-3 py-3 sm:px-4">
              <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                  className="min-h-[46px] max-h-[160px] flex-1 resize-none rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[rgba(45,52,97,0.4)]"
                />

                <button
                  onClick={send}
                  disabled={!canSend}
                  className="shrink-0 rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.25)] disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AgentAppShell>
  );
}

export default function AgentInboxClient() {
  return (
    <Suspense
      fallback={
        <AgentAppShell title="Chat" subtitle="Loading conversation…">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            Loading chat…
          </div>
        </AgentAppShell>
      }
    >
      <AgentChatThreadInner />
    </Suspense>
  );
}
