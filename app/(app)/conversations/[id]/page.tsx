"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { ImagePlus, Send } from "lucide-react";

const shortDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

type MessageItem = {
  id: number;
  sender_type: "user" | "agent" | string;
  message_text: string | null;
  created_at: string;
};

type Attachment = {
  id: number;
  message_id: number;
  kind: string | null;
  original_filename: string | null;
  secure_url: string | null;
  mime_type: string | null;
};

type MessagesResponse = {
  ok: boolean;
  items: MessageItem[];
  last_id: number;
  has_more: boolean;
  attachments_by_message_id?: Record<string, Attachment[]>;
  meta?: {
    handoff_status?: string | null;
    project_status?: string | null;
    customer_name?: string | null;
    agent_name?: string | null;
    cancel_reason?: string | null;
  };
  error?: string;
  code?: string;
};

function renderMessageText(text: string | null) {
  const value = String(text || "");
  if (!value) return [value];
  const parts = value.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part) => {
    if (part.match(/^https?:\/\//i)) {
      const isQuote = part.includes("/quote/");
      return {
        type: "link" as const,
        href: part,
        label: isQuote ? "View Quote" : part,
        isQuote,
      };
    }
    return { type: "text" as const, value: part };
  });
}

export default function ConversationThreadPage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = Number(params?.id || 0);

  const [data, setData] = useState<MessagesResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [typing, setTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const attachmentsByMessage = useMemo(() => data?.attachments_by_message_id || {}, [data]);
  const agentName = data?.meta?.agent_name || "Agent";
  const customerName = data?.meta?.customer_name || "You";

  useEffect(() => {
    let active = true;
    async function load() {
      if (!conversationId) return;
      setStatus("loading");
      setMessage(null);
      const res = await authFetch(`/api/mobile/paid-chat/messages?conversation_id=${conversationId}&limit=80`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (res.status === 403 && json?.code === "PROJECT_LOCKED") {
          setLocked(true);
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load messages.");
        }
        return;
      }
      if (active) {
        setData(json as MessagesResponse);
        setStatus("idle");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [conversationId, router]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.items?.length]);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    async function poll() {
      if (!alive) return;
      setPolling(true);
      const res = await authFetch(`/api/mobile/paid-chat/messages?conversation_id=${conversationId}&limit=80`);
      const json = await res.json().catch(() => ({}));
      if (alive && res.ok) {
        setData(json as MessagesResponse);
      }
      if (alive) setPolling(false);
    }
    const timer = setInterval(poll, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversationId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!input.trim() && !selectedFile) return;
    setSending(true);
    let attachmentPayload: any = null;
    if (selectedFile) {
      const form = new FormData();
      form.append("conversation_id", String(conversationId));
      form.append("file", selectedFile);
      const uploadRes = await authFetch("/api/mobile/paid-chat/upload", {
        method: "POST",
        body: form,
      });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadJson?.ok) {
        setMessage(uploadJson?.error || "Unable to upload image.");
        setSending(false);
        return;
      }
      attachmentPayload = { file: uploadJson.file };
    }

    const res = await authFetch("/api/mobile/paid-chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        message_text: input.trim(),
        ...(attachmentPayload || {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setMessage(json?.error || "Unable to send message.");
      setSending(false);
      return;
    }
    setInput("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setSending(false);
    setTyping(false);

    const refresh = await authFetch(`/api/mobile/paid-chat/messages?conversation_id=${conversationId}&limit=80`);
    const refreshJson = await refresh.json().catch(() => ({}));
    if (refresh.ok) setData(refreshJson as MessagesResponse);
  }

  if (!conversationId) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Invalid conversation.
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Conversation #{conversationId}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {data?.meta?.agent_name ? `Agent: ${data.meta.agent_name}` : "Assigned agent"}
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {data?.meta?.handoff_status || "in progress"}
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
            <div className="h-16 w-full rounded-2xl bg-neutral-100" />
            <div className="h-16 w-full rounded-2xl bg-neutral-100" />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      {locked ? (
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
          {message || "This project is locked. Start a new project to continue."}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div ref={messagesRef} className="hide-scrollbar flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
          {(data?.items || []).map((item) => (
            <div key={item.id} className={`flex ${item.sender_type === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  item.sender_type === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-neutral-100 text-neutral-900"
                }`}
              >
                <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${item.sender_type === "user" ? "text-emerald-100" : "text-neutral-500"}`}>
                  {item.sender_type === "user" ? customerName : agentName}
                </p>
                <div className="space-y-2 text-sm">
                  {renderMessageText(item.message_text).map((chunk, idx) => {
                    if ((chunk as any).type === "link") {
                      const link = chunk as any;
                      return (
                        <a
                          key={`${item.id}-link-${idx}`}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex w-fit max-w-full items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${
                            link.isQuote ? "bg-white text-emerald-700 shadow-sm" : "bg-emerald-700 text-white"
                          }`}
                        >
                          {link.label}
                        </a>
                      );
                    }
                    return (
                      <p key={`${item.id}-text-${idx}`} className="whitespace-pre-wrap break-words">
                        {(chunk as any).value || ""}
                      </p>
                    );
                  })}
                </div>
                {attachmentsByMessage[String(item.id)]?.length ? (
                  <div className="mt-2 space-y-2">
                    {attachmentsByMessage[String(item.id)].map((att) => (
                      <a
                        key={att.id}
                        href={att.secure_url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        {att.secure_url ? (
                          <img
                            src={att.secure_url}
                            alt={att.original_filename || "Attachment"}
                            className="max-h-48 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="text-xs underline">{att.original_filename || "Attachment"}</span>
                        )}
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className={`mt-2 text-[10px] ${item.sender_type === "user" ? "text-emerald-100" : "text-neutral-400"}`}>
                  {shortDate.format(new Date(item.created_at))}
                </p>
              </div>
            </div>
          ))}
        </div>

        {previewUrl ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={previewUrl} alt="Upload preview" className="h-16 w-16 rounded-xl object-cover" />
                <div>
                  <p className="text-xs font-semibold text-neutral-700">Image ready</p>
                  <p className="text-[10px] text-neutral-500">{selectedFile?.name || "attachment"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="btn btn-ghost px-3 py-1 text-xs"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSend} className="mt-4 flex items-center gap-2">
          <div className="relative flex-1 rounded-2xl ring-1 ring-transparent focus-within:ring-emerald-200 focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.15)]">
            <label
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              aria-label="Add image"
            >
              <ImagePlus className="h-4 w-4" />
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) return;
                  setSelectedFile(file);
                  setPreviewUrl(URL.createObjectURL(file));
                }}
                disabled={locked || sending}
              />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!typing) setTyping(true);
                if (typing) {
                  // no-op: placeholder for future typing signal
                }
              }}
              placeholder={locked ? "Chat disabled for this project" : "Type your message"}
              className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-11 pr-4 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              disabled={locked || sending}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary px-4 py-3 text-xs"
            disabled={locked || sending}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        {typing ? (
          <p className="mt-3 text-xs text-neutral-500">Typing…</p>
        ) : null}
      </div>
    </div>
  );
}
