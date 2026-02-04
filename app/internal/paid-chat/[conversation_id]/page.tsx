"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

    return { rows, last, assigned_agent_id, assigned_agent_username };
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

  // Boot: claim + initial load + start polling
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

        // always keep assignment fresh
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
    }, 1200);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
          <div className="truncate text-sm font-semibold">Conversation #{conversationId}</div>
          <div className="mt-0.5 text-[11px] text-white/50 truncate">
            {assignmentLine}
            {claimNote ? ` • ${claimNote}` : ""}
          </div>
        </div>

        <div className="ml-auto shrink-0 text-[11px] text-white/50">Agent view</div>
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
                const bubble = isAgent
                  ? "ml-auto bg-white text-neutral-950"
                  : "mr-auto bg-white/[0.06] border border-white/10 text-white";

                const metaColor = isAgent ? "text-black/50" : "text-white/50";
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
    </div>
  );
}
