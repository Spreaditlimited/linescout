"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

type RefreshState = {
  ok: boolean;
  conversation_id: number | null;
  chat_mode: "limited_human" | "ai_only";
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
  ended: boolean;
  error?: string;
};

type MessageItem = {
  id: number;
  sender_type: "user" | "agent" | "ai" | string;
  sender_id?: number | null;
  sender_name?: string | null;
  message_text: string | null;
  created_at: string;
};

type MessagesResponse = {
  ok: boolean;
  items: MessageItem[];
  has_more: boolean;
  error?: string;
  agent_name_map?: Record<string, string>;
  meta?: {
    customer_name?: string | null;
    agent_name?: string | null;
  };
};

function timeUntilSafe(iso?: string | null) {
  if (!iso) return "24h";
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return "24h";
  const diff = Math.max(t - Date.now(), 0);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function QuickChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeType = (searchParams.get("route_type") || "machine_sourcing") as RouteType;
  const paramConversationId = Number(searchParams.get("conversation_id") || 0) || null;

  const [conversationId, setConversationId] = useState<number | null>(paramConversationId);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [limit, setLimit] = useState(0);
  const [used, setUsed] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [meta, setMeta] = useState<{ customer_name?: string | null; agent_name?: string | null } | null>(null);
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastConsumedAgentMsgIdRef = useRef<number>(0);
  const agentBaselineInitializedRef = useRef(false);
  const consumingRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);

  const remaining = useMemo(() => Math.max(limit - used, 0), [limit, used]);
  const expiresIn = useMemo(() => timeUntilSafe(expiresAt), [expiresAt]);

  const refresh = useCallback(async () => {
    const res = await authFetch("/api/mobile/limited-human/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route_type: routeType }),
    });
    const data: RefreshState = await res.json().catch(() => ({
      ok: false,
      conversation_id: null,
      chat_mode: "ai_only",
      human_message_limit: 0,
      human_message_used: 0,
      human_access_expires_at: null,
      ended: true,
    }));
    if (!data?.ok) return;
    setLimit(Number(data.human_message_limit || 0));
    setUsed(Number(data.human_message_used || 0));
    setExpiresAt(data.human_access_expires_at ? String(data.human_access_expires_at) : null);
    setEnded(Boolean(data.ended));
    if (!conversationId && data.conversation_id) {
      setConversationId(Number(data.conversation_id));
    }
  }, [routeType, conversationId]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const res = await authFetch(`/api/mobile/messages?conversation_id=${conversationId}&limit=80`);
    const json: MessagesResponse = await res.json().catch(() => ({} as MessagesResponse));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Unable to load messages.");
      return;
    }
    setError(null);
    const items = Array.isArray(json.items) ? json.items : [];
    setMessages(items);
    if (json.meta) setMeta(json.meta);
    if (json.agent_name_map && typeof json.agent_name_map === "object") {
      setAgentNameMap(json.agent_name_map as Record<string, string>);
    }
  }, [conversationId]);

  const consumeIfNeeded = useCallback(
    async (latestAgentMsgId: number) => {
      if (!latestAgentMsgId) return;
      if (ended) return;
      if (consumingRef.current) return;
      if (latestAgentMsgId <= (lastConsumedAgentMsgIdRef.current || 0)) return;
      consumingRef.current = true;
      try {
        const res = await authFetch("/api/mobile/limited-human/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_type: routeType, conversation_id: conversationId }),
        });
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          setLimit(Number(data.human_message_limit || 0));
          setUsed(Number(data.human_message_used || 0));
          setEnded(Boolean(data.ended));
          lastConsumedAgentMsgIdRef.current = latestAgentMsgId;
        }
      } finally {
        consumingRef.current = false;
      }
    },
    [routeType, conversationId, ended]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await refresh();
        await loadMessages();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;
    const t = setInterval(async () => {
      await refresh();
      await loadMessages();
    }, 6000);
    return () => clearInterval(t);
  }, [conversationId, refresh, loadMessages]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    shouldStickToBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el || !messages.length) return;
    const runInitial = !initialScrollDoneRef.current;
    if (!runInitial && !shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      if (!messagesRef.current) return;
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: runInitial ? "auto" : "smooth",
      });
      initialScrollDoneRef.current = true;
    });
  }, [messages.length, conversationId]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(48, Math.min(el.scrollHeight, 96))}px`;
  }, [input]);

  useEffect(() => {
    if (!messages.length) return;
    const latestAgent = [...messages].reverse().find((m) => m.sender_type === "agent");
    if (!latestAgent?.id) return;
    const latestId = Number(latestAgent.id);
    if (!agentBaselineInitializedRef.current) {
      lastConsumedAgentMsgIdRef.current = latestId;
      agentBaselineInitializedRef.current = true;
      return;
    }
    consumeIfNeeded(latestId);
  }, [messages, consumeIfNeeded]);

  async function sendMessage() {
    if (!conversationId) return;
    if (!input.trim() || sending || ended) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    const optimisticId = -1 * (Date.now() * 1000 + Math.floor(Math.random() * 1000));
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, sender_type: "user", message_text: text, created_at: new Date().toISOString() },
    ]);
    const res = await authFetch("/api/mobile/limited-human/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, message_text: text }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Unable to send message.");
    } else {
      await loadMessages();
    }
    setSending(false);
  }

  return (
    <div className="px-6 py-10">
      <div className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-neutral-400">LineScout</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Quick Specialist Chat</h1>
          </div>
          <button
            type="button"
            onClick={() => router.replace(`/machine?route_type=${routeType}`)}
            className="text-xs font-semibold text-neutral-500"
          >
            Close
          </button>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
            {ended
              ? "Quick specialist chat has ended."
              : remaining === 1
                ? "You have 1 specialist reply left."
                : `You have ${remaining} specialist replies left.`}
            {!ended && expiresAt ? ` Expires in ${expiresIn}.` : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          <div
            ref={messagesRef}
            onScroll={() => {
              const el = messagesRef.current;
              if (!el) return;
              const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
              shouldStickToBottomRef.current = distanceFromBottom <= 120;
            }}
            className="mt-4 h-[420px] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4"
          >
            {loading ? (
              <p className="text-sm text-neutral-500">Loading chat…</p>
            ) : messages.length ? (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isUser = m.sender_type === "user";
                  const mappedName =
                    m.sender_type === "agent" && m.sender_name == null
                      ? agentNameMap[String((m as any).sender_id || "")]
                      : null;
                  const agentLabel = m.sender_name || mappedName || meta?.agent_name || "Specialist";
                  const label = isUser ? meta?.customer_name || "You" : agentLabel;
                  return (
                    <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                          isUser ? "bg-[var(--agent-blue)] text-white" : "bg-neutral-100 text-neutral-900"
                        }`}
                      >
                        <p className="mb-1 text-[11px] font-semibold opacity-80">{label}</p>
                        <p className="whitespace-pre-wrap break-words">{m.message_text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No messages yet.</p>
            )}
          </div>

          <div className="mt-4 flex items-end gap-3">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "0px";
                el.style.height = `${Math.max(48, Math.min(el.scrollHeight, 96))}px`;
              }}
              placeholder={ended ? "Quick chat ended" : "Write a message"}
              disabled={ended}
              rows={1}
              className="min-h-12 max-h-24 flex-1 resize-none overflow-y-auto rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={sending || ended || !input.trim()}
              className="btn btn-primary px-4 py-3 text-sm"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
