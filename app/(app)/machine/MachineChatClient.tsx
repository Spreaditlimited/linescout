"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { MessageSquarePlus, Sparkles, User, Send, ImagePlus, Pencil, Trash2 } from "lucide-react";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

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

type Attachment = {
  id: number;
  message_id: number;
  kind: "image" | "pdf" | "file" | string;
  original_filename: string | null;
  mime_type: string | null;
  bytes: number | null;
  secure_url: string | null;
  width: number | null;
  height: number | null;
};

type MessagesResponse = {
  ok: boolean;
  items: MessageItem[];
  has_more: boolean;
  error?: string;
  attachments_by_message_id?: Record<string, Attachment[]>;
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

export default function MachineChatClient() {
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
  const [quickMeta, setQuickMeta] = useState<{ limit: number; used: number; ended: boolean; expiresAt?: string | null } | null>(null);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Record<string, Attachment[]>>({});
  const [stickyCollapsed, setStickyCollapsed] = useState(false);
  const [chatMeta, setChatMeta] = useState<{ customer_name?: string | null; agent_name?: string | null } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameTarget, setRenameTarget] = useState<ConversationRow | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  async function submitRename() {
    if (!renameTarget || renaming) return;
    const title = String(renameValue || "").trim();
    if (!title) return;
    setRenaming(true);
    const res = await authFetch("/api/mobile/conversations/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: renameTarget.id, title }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Unable to rename conversation.");
      setRenaming(false);
      return;
    }
    setConversations((prev) =>
      prev.map((item) => (item.id === renameTarget.id ? { ...item, title } : item))
    );
    setRenaming(false);
    setRenameOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  }

  async function submitDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);

    const res = await authFetch("/api/mobile/conversations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: deleteTarget.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Unable to delete conversation.");
      setDeleting(false);
      return;
    }

    const remaining = conversations.filter((c) => c.id !== deleteTarget.id);
    setConversations(remaining);

    if (activeId === deleteTarget.id) {
      setActiveId(remaining[0]?.id || null);
      if (!remaining.length) setMessages([WELCOME_MSG]);
    }

    setDeleting(false);
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

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
      const json: MessagesResponse = await res.json().catch(() => ({} as MessagesResponse));
      if (!res.ok) {
        if (active) setError(json?.error || "Unable to load messages.");
        setLoading(false);
        return;
      }
      const items: MessageItem[] = Array.isArray(json?.items) ? json.items : [];
      if (!active) return;
      setMessages(items.length ? items : [WELCOME_MSG]);
      if (json?.meta) setChatMeta(json.meta);
      if (json?.attachments_by_message_id) {
        setAttachmentsByMessageId(json.attachments_by_message_id);
      }
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
            expiresAt: refreshJson.human_access_expires_at || null,
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
      const json: MessagesResponse = await res.json().catch(() => ({} as MessagesResponse));
      if (!res.ok || !json?.ok) return;
      const items: MessageItem[] = Array.isArray(json?.items) ? json.items : [];
      setMessages(items.length ? items : [WELCOME_MSG]);
      if (json?.meta) setChatMeta(json.meta);
      if (json?.attachments_by_message_id) {
        setAttachmentsByMessageId((prev) => ({ ...prev, ...json.attachments_by_message_id }));
      }

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
    const text = input.trim();
    if (!activeId || !text || sending) return;
    setSending(true);
    setError(null);

    const optimisticIdBase = Date.now();
    const optimisticUser: MessageItem = {
      id: -optimisticIdBase,
      sender_type: "user",
      message_text: text,
      created_at: new Date().toISOString(),
    };
    const thinkingMessage: MessageItem = {
      id: -(optimisticIdBase + 1),
      sender_type: "ai",
      message_text: "Thinking...",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser, thinkingMessage]);
    setInput("");

    const res = await authFetch("/api/mobile/ai-chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeId, message_text: text }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Unable to send.");
      setMessages((prev) =>
        prev.filter((m) => m.id !== optimisticUser.id && m.id !== thinkingMessage.id)
      );
      setSending(false);
      return;
    }

    setSending(false);

    const refresh = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
    const refreshJson = await refresh.json().catch(() => ({}));
    if (refresh.ok && refreshJson?.ok) {
      const items: MessageItem[] = Array.isArray(refreshJson.items) ? refreshJson.items : [];
      setMessages(items.length ? items : [WELCOME_MSG]);
    }
  }

  async function sendQuickMessage() {
    const text = input.trim();
    if (!activeId || (!text && !selectedFile) || sending || quickMeta?.ended) return;
    setSending(true);
    setUploadErr(null);
    setError(null);

    try {
      let attachmentPayload: any = null;
      if (selectedFile) {
        const form = new FormData();
        form.append("conversation_id", String(activeId));
        form.append("file", selectedFile);
        const uploadRes = await authFetch("/api/mobile/paid-chat/upload", {
          method: "POST",
          body: form,
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadJson?.ok) {
          setUploadErr(uploadJson?.error || "Unable to upload image.");
          setSending(false);
          return;
        }
        attachmentPayload = { file: uploadJson.file };
      }

      const res = await authFetch("/api/mobile/limited-human/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeId,
          message_text: text,
          route_type: routeType,
          ...(attachmentPayload || {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Unable to send.");
        return;
      }

      setInput("");
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);

      const refresh = await authFetch(`/api/mobile/messages?conversation_id=${activeId}&limit=80`);
      const refreshJson = await refresh.json().catch(() => ({}));
      if (refresh.ok && refreshJson?.ok) {
        const items: MessageItem[] = Array.isArray(refreshJson.items) ? refreshJson.items : [];
        setMessages(items.length ? items : [WELCOME_MSG]);
        if (refreshJson?.attachments_by_message_id) {
          setAttachmentsByMessageId((prev) => ({ ...prev, ...refreshJson.attachments_by_message_id }));
        }
      }
    } finally {
      setSending(false);
    }
  }

  const activeConv = conversations.find((c) => c.id === activeId) || null;
  const isQuick = activeConv?.chat_mode === "limited_human";
  const quickCustomer = String(chatMeta?.customer_name || "You");
  const quickAgent = String(chatMeta?.agent_name || "Specialist");

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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">AI chat</p>
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
              <div
                key={c.id}
                className={`w-full rounded-2xl px-3 py-2 text-left text-sm transition ${
                  activeId === c.id
                    ? "bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {c.chat_mode === "limited_human" ? (
                      <User className="h-4 w-4 text-[var(--agent-blue)]" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-[var(--agent-blue)]" />
                    )}
                    <span className="font-semibold">{convTitle(c)}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1 text-neutral-400 hover:text-[var(--agent-blue)]"
                    onClick={() => {
                      setRenameTarget(c);
                      setRenameValue(String(c.title || ""));
                      setRenameOpen(true);
                    }}
                    aria-label="Rename conversation"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1 text-neutral-400 hover:text-red-600"
                    onClick={() => {
                      setDeleteTarget(c);
                      setDeleteOpen(true);
                    }}
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className="mt-1 block w-full text-left"
                >
                  <span
                    className="block text-xs text-neutral-500"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      lineHeight: "1.4rem",
                      maxHeight: "2.8rem",
                    }}
                  >
                    {c.last_message_text || "No messages yet"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 flex min-h-[70vh] max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:min-h-[560px] sm:max-h-[72vh] sm:p-6 lg:order-2">
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
              {stickyCollapsed ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-600">Project shortcuts</p>
                  <button
                    type="button"
                    onClick={() => setStickyCollapsed(false)}
                    className="text-xs font-semibold text-[var(--agent-blue)]"
                  >
                    Show
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Ready to start a project?</p>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                        Choose what you want to do. You can attach this chat as context.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStickyCollapsed(true)}
                      className="text-xs font-semibold text-neutral-500"
                    >
                      Minimize
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={goToMachineSourcingProject} className="btn btn-primary px-4 py-2 text-xs">
                      Machine Sourcing
                    </button>
                    <button type="button" onClick={goToWhiteLabelWizard} className="btn btn-outline px-4 py-2 text-xs">
                      White Label
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {quickMeta && !quickMeta.ended ? (
            <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-4 py-3 text-xs text-[var(--agent-blue)]">
              {quickMeta.used} of {quickMeta.limit} specialist replies used.{" "}
              {quickMeta.expiresAt ? `Expires in ${timeUntilSafe(quickMeta.expiresAt)}.` : "Expires in 24 hours."}
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
            {messages.map((m) => {
              const attachments = attachmentsByMessageId[String(m.id)] || [];
              const isUser = m.sender_type === "user";
              return (
              <div key={m.id} className={`flex ${m.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    m.sender_type === "user" ? "bg-[var(--agent-blue)] text-white" : "bg-neutral-100 text-neutral-900"
                  }`}
                >
                  {isQuick ? (
                    <p className="mb-1 text-[11px] font-semibold opacity-80">
                      {m.sender_type === "agent" ? quickAgent : isUser ? quickCustomer : "AI"}
                    </p>
                  ) : null}
                  {m.message_text ? (
                    <p className="whitespace-pre-wrap break-words">{m.message_text}</p>
                  ) : null}
                  {attachments.length ? (
                    <div className={`mt-2 grid gap-2 ${m.message_text ? "" : "-mt-1"}`}>
                      {attachments.map((a) =>
                        a.kind === "image" ? (
                          <a key={a.id} href={a.secure_url || "#"} target="_blank" rel="noreferrer">
                            <img
                              src={a.secure_url || ""}
                              alt={a.original_filename || "Attachment"}
                              className="max-h-48 rounded-xl object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            key={a.id}
                            href={a.secure_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-[rgba(45,52,97,0.12)] bg-white/70 px-3 py-2 text-xs font-semibold text-[#2D3461]"
                          >
                            {a.original_filename || "Attachment"}
                          </a>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isQuick) sendQuickMessage();
              else sendAiMessage();
            }}
            className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-2 border-t border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <div className="relative flex-1 rounded-2xl ring-1 ring-transparent focus-within:ring-[rgba(45,52,97,0.18)] focus-within:shadow-[0_0_0_4px_rgba(45,52,97,0.18)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message"
                className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-4 pr-4 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                disabled={sending || (isQuick && quickMeta?.ended)}
              />
            </div>
            {isQuick && !input.trim().length && !selectedFile ? (
              <label className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(45,52,97,0.2)] text-[#2D3461]">
                <ImagePlus className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (!file) return;
                    setUploadErr(null);
                    setSelectedFile(file);
                    setPreviewUrl(URL.createObjectURL(file));
                  }}
                  disabled={sending || quickMeta?.ended}
                />
              </label>
            ) : (
              <button
                type="submit"
                className="btn btn-primary px-4 py-3 text-xs"
                disabled={sending || (isQuick && quickMeta?.ended)}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </form>
          {previewUrl ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-3 py-2 text-xs text-neutral-600">
              <div className="flex items-center gap-2">
                <img src={previewUrl} alt="Upload preview" className="h-10 w-10 rounded-xl object-cover" />
                <span>{selectedFile?.name || "attachment"}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="text-xs font-semibold text-[#2D3461]"
              >
                Remove
              </button>
            </div>
          ) : null}
          {uploadErr ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {uploadErr}
            </div>
          ) : null}
        </div>
      </div>

      {renameOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close rename modal"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => {
              if (renaming) return;
              setRenameOpen(false);
              setRenameTarget(null);
              setRenameValue("");
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                LineScout
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Rename conversation</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Give this chat a short, clear title.
              </p>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Conversation title"
                className="mt-4 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[rgba(45,52,97,0.12)] bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  if (renaming) return;
                  setRenameOpen(false);
                  setRenameTarget(null);
                  setRenameValue("");
                }}
                className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRename}
                disabled={renaming || !renameValue.trim()}
                className="btn btn-primary px-4 py-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {renaming ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close delete modal"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => {
              if (deleting) return;
              setDeleteOpen(false);
              setDeleteTarget(null);
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                LineScout
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Delete conversation?</h2>
              <p className="mt-2 text-sm text-neutral-600">
                This permanently removes the chat and its messages. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[rgba(45,52,97,0.12)] bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  if (deleting) return;
                  setDeleteOpen(false);
                  setDeleteTarget(null);
                }}
                className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDelete}
                disabled={deleting}
                className="btn btn-primary px-4 py-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
