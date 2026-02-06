"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { MessageSquarePlus, Sparkles, User, Send } from "lucide-react";

type RouteType = "machine_sourcing" | "white_label";

type ConversationRow = {
  id: number;
  route_type: RouteType;
  chat_mode: "ai_only" | "limited_human" | "paid_human";
  payment_status: "unpaid" | "pending" | "paid";
  project_status: "active" | "cancelled";
  handoff_id: number | null;
  updated_at: string;
  created_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
  title?: string | null;
};

type MessageItem = {
  id: number;
  sender_type: "user" | "ai" | "agent" | string;
  message_text: string | null;
  created_at: string;
};

type MessagesResponse = {
  ok: boolean;
  items: MessageItem[];
  has_more: boolean;
  attachments_by_message_id?: Record<string, any[]>;
  meta?: {
    customer_name?: string | null;
    agent_name?: string | null;
  };
};

const WELCOME_MSG: MessageItem = {
  id: -1,
  sender_type: "ai",
  message_text:
    "Hi, I’m LineScout. I help businesses make sound decisions when sourcing from China. Machines, production lines, and white-label products. Tell me what you want to source and we’ll think it through.",
  created_at: new Date().toISOString(),
};

function convTitle(c: ConversationRow) {
  const t = String(c.title || "").trim();
  if (t) return t;
  return "AI Conversation";
}

function isEmptyAiConversation(c: ConversationRow) {
  if (c.chat_mode !== "ai_only") return false;
  const lastText = String(c.last_message_text || "").trim();
  return !lastText && !c.last_message_at;
}

function upsertConversation(list: ConversationRow[], incoming: ConversationRow) {
  const existingIndex = list.findIndex((c) => c.id === incoming.id);
  if (existingIndex >= 0) {
    const copy = [...list];
    copy[existingIndex] = { ...copy[existingIndex], ...incoming };
    return copy;
  }
  return [incoming, ...list];
}

export default function MachineChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeType = (searchParams.get("route_type") || "machine_sourcing") as RouteType;
  const paramConversationId = Number(searchParams.get("conversation_id") || 0) || null;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(paramConversationId);
  const [messages, setMessages] = useState<MessageItem[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickMeta, setQuickMeta] = useState<{ limit: number; used: number; ended: boolean } | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const aiConversations = useMemo(
    () =>
      conversations.filter((c) => c.chat_mode === "ai_only" || c.chat_mode === "limited_human"),
    [conversations]
  );

  useEffect(() => {
    let active = true;
    async function loadList() {
      const res = await authFetch(`/api/mobile/conversations/list?route_type=${routeType}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const items: ConversationRow[] = Array.isArray(json?.items) ? json.items : [];
      if (!active) return;
      setConversations(items);

      if (!activeId) {
        const first = items.find((c) => c.chat_mode === "ai_only" || c.chat_mode === "limited_human");
        if (first) setActiveId(first.id);
      }

      if (!items.length) {
        // create a new AI conversation
        const create = await authFetch("/api/mobile/conversations/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_type: routeType }),
        });
        const created = await create.json().catch(() => ({}));
        if (create.ok && created?.conversation?.id) {
          const id = Number(created.conversation.id);
          setActiveId(id);
          setConversations((prev) => upsertConversation(prev, created.conversation));
        }
      }
    }
    loadList();
    return () => {
      active = false;
    };
  }, [routeType, activeId]);

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      if (!activeId) return;
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (active) setError(json?.error || "Unable to load messages.");
        setLoading(false);
        return;
      }
      const items: MessageItem[] = Array.isArray(json?.items) ? json.items : [];
      if (!active) return;
      setMessages(items.length ? items : [WELCOME_MSG]);
      setLoading(false);

      // If quick human, refresh metadata
      const conv = conversations.find((c) => c.id === activeId);
      if (conv?.chat_mode === "limited_human") {
        const refresh = await authFetch("/api/mobile/limited-human/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_type: routeType }),
        });
        const refreshJson = await refresh.json().catch(() => ({}));
        if (refresh.ok && refreshJson?.ok) {
          setQuickMeta({
            limit: Number(refreshJson.human_message_limit || 0),
            used: Number(refreshJson.human_message_used || 0),
            ended: Boolean(refreshJson.ended),
          });
        }
      } else {
        setQuickMeta(null);
      }
    }
    loadMessages();
    return () => {
      active = false;
    };
  }, [activeId, conversations, routeType]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(async () => {
      const res = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return;
      const items: MessageItem[] = Array.isArray(json?.items) ? json.items : [];
      setMessages(items.length ? items : [WELCOME_MSG]);

      // consume quick human credits if agent responded
      const latestAgent = [...items].reverse().find((m) => m.sender_type === "agent");
      if (latestAgent) {
        await authFetch("/api/mobile/limited-human/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_type: routeType, conversation_id: activeId }),
        });
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [activeId, routeType]);

  async function sendAiMessage() {
    if (!activeId || !input.trim() || sending) return;
    setSending(true);
    setError(null);

    const res = await authFetch("/api/mobile/ai-chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeId, message_text: input.trim() }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Unable to send.");
      setSending(false);
      return;
    }

    setInput("");
    setSending(false);

    const refresh = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
    const refreshJson = await refresh.json().catch(() => ({}));
    if (refresh.ok && refreshJson?.ok) {
      const items: MessageItem[] = Array.isArray(refreshJson.items) ? refreshJson.items : [];
      setMessages(items.length ? items : [WELCOME_MSG]);
    }
  }

  async function sendQuickMessage() {
    if (!activeId || !input.trim() || sending) return;
    setSending(true);
    const res = await authFetch("/api/mobile/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeId, message_text: input.trim(), route_type: routeType }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Unable to send.");
      setSending(false);
      return;
    }
    setInput("");
    setSending(false);

    const refresh = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
    const refreshJson = await refresh.json().catch(() => ({}));
    if (refresh.ok && refreshJson?.ok) {
      const items: MessageItem[] = Array.isArray(refreshJson.items) ? refreshJson.items : [];
      setMessages(items.length ? items : [WELCOME_MSG]);
    }
  }

  const activeConv = conversations.find((c) => c.id === activeId) || null;
  const isQuick = activeConv?.chat_mode === "limited_human";

  function goToMachineSourcingProject() {
    const qs = new URLSearchParams({
      route_type: "machine_sourcing",
      ...(activeId ? { source_conversation_id: String(activeId) } : {}),
    });
    router.push(`/sourcing-project?${qs.toString()}`);
  }

  function goToWhiteLabelWizard() {
    const qs = new URLSearchParams({
      ...(activeId ? { source_conversation_id: String(activeId) } : {}),
    });
    const suffix = qs.toString();
    router.push(`/white-label/start${suffix ? `?${suffix}` : ""}`);
  }

  return (
    <div className="px-6 py-10">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="order-2 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm lg:order-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">AI chat</p>
            <button
              type="button"
              onClick={async () => {
                const reuse = conversations.find(isEmptyAiConversation);
                if (reuse) {
                  setActiveId(reuse.id);
                  return;
                }

                const res = await authFetch("/api/mobile/conversations/create", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ route_type: routeType }),
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok && json?.conversation?.id) {
                  setActiveId(Number(json.conversation.id));
                  setConversations((prev) => upsertConversation(prev, json.conversation));
                }
              }}
              className="btn btn-outline px-3 py-1 text-xs"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-1.5">
            {aiConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`w-full rounded-2xl px-3 py-2 text-left text-sm transition ${
                  activeId === c.id
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {c.chat_mode === "limited_human" ? (
                    <User className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                  )}
                  <span className="font-semibold">{convTitle(c)}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                  {c.last_message_text || "No messages yet"}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="order-1 flex min-h-[480px] max-h-[70vh] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:min-h-[560px] sm:max-h-[72vh] sm:p-6 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900 sm:text-xl">LineScout Assistant</h1>
              <p className="text-xs text-neutral-600 sm:text-sm">
                {isQuick ? "Specialist conversation" : "AI guidance for sourcing decisions"}
              </p>
            </div>
          </div>

          {!isQuick ? (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">Ready to start a project?</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                Choose what you want to do. You can attach this chat as context.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={goToMachineSourcingProject} className="btn btn-primary px-4 py-2 text-xs">
                  Machine Sourcing
                </button>
                <button type="button" onClick={goToWhiteLabelWizard} className="btn btn-outline px-4 py-2 text-xs">
                  White Label
                </button>
              </div>
            </div>
          ) : null}

          {quickMeta && !quickMeta.ended ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              {quickMeta.used} of {quickMeta.limit} specialist replies used. Expires in 30 minutes.
            </div>
          ) : null}

          {quickMeta?.ended ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Brief specialist chat ended. Continue with AI or start a new request.
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
              Loading chat…
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div
            ref={messagesRef}
            className="hide-scrollbar mt-4 flex-1 space-y-4 overflow-y-auto pr-1 sm:mt-6"
          >
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    m.sender_type === "user" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.message_text}</p>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isQuick) sendQuickMessage();
              else sendAiMessage();
            }}
            className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-2 border-t border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <div className="relative flex-1 rounded-2xl ring-1 ring-transparent focus-within:ring-emerald-200 focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.15)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message"
                className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-4 pr-4 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                disabled={sending}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary px-4 py-3 text-xs"
              disabled={sending}
              aria-label="Send message"
            >
              {sending ? "Sending..." : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
