"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { ImagePlus, Send, X } from "lucide-react";

const shortDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

type MessageItem = {
  id: number;
  sender_type: "user" | "agent" | string;
  sender_id?: number | null;
  message_text: string | null;
  reply_to_message_id?: number | null;
  reply_to_sender_type?: "user" | "agent" | string | null;
  reply_to_text?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_by_type?: string | null;
  deleted_by_id?: number | null;
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
  agent_name_map?: Record<string, string>;
  admin_sender_ids?: number[];
  attachments_by_message_id?: Record<string, Attachment[]>;
  meta?: {
    handoff_status?: string | null;
    project_status?: string | null;
    customer_name?: string | null;
    agent_name?: string | null;
    cancel_reason?: string | null;
    handoff_id?: number | null;
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

function formatStageLabel(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "manufacturer_found") return "Manufacturer found";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function sendEscalation(params: {
  kind: "report" | "escalate";
  conversation_id: number;
  handoff_id?: number | null;
  reason?: string | null;
}) {
  const res = await authFetch("/api/mobile/paid-chat/escalate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: params.kind,
      conversation_id: params.conversation_id,
      handoff_id: params.handoff_id ?? null,
      reason: params.reason || "",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Could not send. Please try again.");
  }
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
  const [uploadState, setUploadState] = useState<"idle" | "compressing" | "uploading" | "ready" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<any | null>(null);
  const [polling, setPolling] = useState(false);
  const [shelfCollapsed, setShelfCollapsed] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageItem | null>(null);
  const [editingTarget, setEditingTarget] = useState<MessageItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageItem | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateKind, setEscalateKind] = useState<"report" | "escalate">("report");
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateSending, setEscalateSending] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [escalateSuccess, setEscalateSuccess] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const lastReadRef = useRef<number>(0);

  const attachmentsByMessage = useMemo(() => data?.attachments_by_message_id || {}, [data]);
  const agentNameMap = useMemo(() => data?.agent_name_map || {}, [data]);
  const adminSenderIdSet = useMemo(
    () => new Set((data?.admin_sender_ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
    [data]
  );
  const agentName = data?.meta?.agent_name || "Agent";
  const customerName = data?.meta?.customer_name || "You";
  const stageLabel = formatStageLabel(data?.meta?.handoff_status) || "In progress";
  const lockedReason = data?.meta?.cancel_reason || "";

  useEffect(() => {
    let active = true;
    async function load() {
      if (!conversationId) return;
      setStatus("loading");
      setMessage(null);

      const convRes = await authFetch(`/api/mobile/conversations/get?conversation_id=${conversationId}`);
      const convJson = await convRes.json().catch(() => ({}));
      if (!convRes.ok) {
        if (convRes.status === 401) {
          router.replace("/sign-in");
          return;
        }
      } else {
        const conversation = convJson?.conversation || null;
        if (String(conversation?.conversation_kind || "") === "quick_human") {
          const safeRoute = String(conversation?.route_type || "machine_sourcing");
          router.replace(
            `/quick-chat?route_type=${encodeURIComponent(safeRoute)}&conversation_id=${conversationId}`
          );
          return;
        }
      }

      const res = await authFetch(`/api/mobile/paid-chat/messages?conversation_id=${conversationId}&limit=80`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (res.status === 403 && json?.code === "PROJECT_LOCKED") {
          setLocked(true);
          if (active) {
            setData(json as MessagesResponse);
            setStatus("idle");
          }
          return;
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

  const latestMessageId = data?.items?.length ? data.items[data.items.length - 1]?.id : 0;

  useEffect(() => {
    if (!conversationId || !latestMessageId || latestMessageId <= lastReadRef.current) return;
    lastReadRef.current = latestMessageId;
    authFetch("/api/mobile/paid-chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, last_seen_message_id: latestMessageId }),
    }).catch(() => {});
  }, [conversationId, latestMessageId]);

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

  async function reloadMessages() {
    const refresh = await authFetch(`/api/mobile/paid-chat/messages?conversation_id=${conversationId}&limit=80`);
    const refreshJson = await refresh.json().catch(() => ({}));
    if (refresh.ok) setData(refreshJson as MessagesResponse);
  }

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    const maxDim = 1600;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  }

  async function uploadImage(file: File) {
    setUploadState("compressing");
    setUploadError(null);
    try {
      const compressed = await compressImage(file);
      setUploadState("uploading");
      const form = new FormData();
      form.append("conversation_id", String(conversationId));
      form.append("file", compressed);
      const uploadRes = await authFetch("/api/mobile/paid-chat/upload", {
        method: "POST",
        body: form,
      });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadJson?.ok) {
        throw new Error(uploadJson?.error || "Unable to upload image.");
      }
      const nextFile = uploadJson.file || null;
      setUploadedFile(nextFile);
      setUploadState("ready");
      return nextFile;
    } catch (e: any) {
      setUploadError(e?.message || "Unable to upload image.");
      setUploadState("error");
      return null;
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (editingTarget) {
      const next = input.trim();
      if (!next) return;
      setSending(true);
      const res = await authFetch("/api/mobile/paid-chat/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: editingTarget.id,
          message_text: next,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMessage(json?.error || "Unable to edit message.");
        setSending(false);
        return;
      }
      setInput("");
      setEditingTarget(null);
      setSending(false);
      await reloadMessages();
      return;
    }

    if (!input.trim() && !selectedFile && !uploadedFile) return;
    setReplyTarget(null);
    setSending(true);
    let attachmentPayload: any = null;
      if (uploadedFile) {
        attachmentPayload = { file: uploadedFile };
      } else if (selectedFile) {
        const nextFile = await uploadImage(selectedFile);
        if (nextFile) attachmentPayload = { file: nextFile };
        if (!attachmentPayload) {
          setMessage(uploadError || "Unable to upload image.");
          setSending(false);
          return;
        }
      }

    const res = await authFetch("/api/mobile/paid-chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        message_text: input.trim(),
        reply_to_message_id: replyTarget?.id || null,
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
    setUploadedFile(null);
    setUploadState("idle");
    setUploadError(null);
    setSending(false);

    await reloadMessages();
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

      <div className="mt-3 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-neutral-400">
              LineScout
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Paid Chat</h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
            Specialist
          </div>
        </div>
        <div className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          {shelfCollapsed ? (
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-600">
                {stageLabel} · {agentName || "Unassigned"}
              </p>
              <button
                type="button"
                onClick={() => setShelfCollapsed(false)}
                className="text-xs font-semibold text-[var(--agent-blue)]"
              >
                Show
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Current stage
                  </p>
                  <div className="mt-2 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                    {stageLabel}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Agent
                  </p>
                  <div className="mt-2 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                    {agentName || "Unassigned"}
                  </div>
                </div>
              </div>

              <div className="mt-4 h-px bg-neutral-200" />

              {locked ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">Project closed</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {lockedReason || "This project is closed. Start a new project to continue."}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.replace("/projects/new")}
                    className="btn btn-primary mt-3 px-3 py-2 text-xs"
                  >
                    Start a new project
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-4 text-xs text-neutral-500">
                    Keep this conversation respectful. You can report or escalate privately at any time.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEscalateKind("report");
                        setEscalateReason("");
                        setEscalateError(null);
                        setEscalateSuccess(false);
                        setEscalateOpen(true);
                      }}
                      className="btn btn-outline flex-1 px-4 py-2 text-xs"
                      disabled={!conversationId}
                    >
                      Report
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEscalateKind("escalate");
                        setEscalateReason("");
                        setEscalateError(null);
                        setEscalateSuccess(false);
                        setEscalateOpen(true);
                      }}
                      className="btn btn-primary flex-1 px-4 py-2 text-xs"
                      disabled={!conversationId}
                    >
                      Escalate
                    </button>
                  </div>
                </>
              )}

              <div className="mt-4 text-right">
                <button
                  type="button"
                  onClick={() => setShelfCollapsed(true)}
                  className="text-xs font-semibold text-neutral-500"
                >
                  Minimize
                </button>
              </div>
            </>
          )}
        </div>
        <div ref={messagesRef} className="hide-scrollbar flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1 sm:max-h-[50vh]">
          {(data?.items || []).map((item) => {
            const isUser = item.sender_type === "user";
            const senderId = Number(item.sender_id || 0);
            const isAdminSender = item.sender_type === "agent" && senderId > 0 && adminSenderIdSet.has(senderId);
            const isDeleted = !!item.deleted_at;
            const createdMs = item.created_at ? new Date(item.created_at).getTime() : 0;
            const withinEditWindow = createdMs ? Date.now() - createdMs <= 24 * 60 * 60 * 1000 : false;
            const replyLabel =
              item.reply_to_sender_type === "user" ? customerName : agentName || "Agent";
            const replyText = String(item.reply_to_text || "").trim() || "Message deleted";
            const attachments = attachmentsByMessage[String(item.id)] || [];
            const canEdit = isUser && !isDeleted && !attachments.length && withinEditWindow;
            const canDelete = isUser && !isDeleted && withinEditWindow;
            const canReply = !isDeleted;
            const timeLabel = `${shortDate.format(new Date(item.created_at))}${
              item.edited_at ? " · Edited" : ""
            }`;
            const senderIdKey = senderId > 0 ? String(senderId) : "";
            const mappedAgentName = senderIdKey && agentNameMap[senderIdKey] ? agentNameMap[senderIdKey] : "";
            const agentLabel = mappedAgentName || agentName || "Agent";
            const label = isUser ? customerName : isAdminSender ? "Admin" : agentLabel;
            const bubbleClass = isUser
              ? "bg-[var(--agent-blue)] text-white"
              : isAdminSender
                ? "border border-amber-200 bg-amber-50 text-amber-900"
                : "bg-neutral-100 text-neutral-900";
            const metaClass = isUser ? "text-white/80" : isAdminSender ? "text-amber-700" : "text-neutral-500";

            return (
              <div key={item.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${bubbleClass}`}
                >
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${metaClass}`}>{label}</p>
                  {item.reply_to_message_id ? (
                    <div
                      className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
                        isUser
                          ? "border-white/30 bg-white/10 text-white/80"
                          : "border-[rgba(45,52,97,0.2)] bg-white text-neutral-600"
                      }`}
                    >
                      <p className="font-semibold">{replyLabel}</p>
                      <p className="mt-1 line-clamp-2">{replyText}</p>
                    </div>
                  ) : null}
                  <div className="space-y-2 text-sm">
                    {isDeleted ? (
                      <p className="whitespace-pre-wrap break-words italic opacity-80">Message deleted</p>
                    ) : (
                      renderMessageText(item.message_text).map((chunk, idx) => {
                        if ((chunk as any).type === "link") {
                          const link = chunk as any;
                          return (
                            <a
                              key={`${item.id}-link-${idx}`}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex w-fit max-w-full items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${
                                link.isQuote
                                  ? "bg-white text-[var(--agent-blue)] shadow-sm"
                                  : "bg-[var(--agent-blue)] text-white"
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
                      })
                    )}
                  </div>
                  {!isDeleted && attachments.length ? (
                    <div className="mt-2 space-y-2">
                      {attachments.map((att) => (
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
                  <p className={`mt-2 text-[10px] ${isUser ? "text-white/80" : isAdminSender ? "text-amber-700" : "text-neutral-400"}`}>{timeLabel}</p>
                  {canReply || canEdit || canDelete ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em]">
                      {canReply ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTarget(item);
                            setEditingTarget(null);
                          }}
                          className={isUser ? "text-white/80" : "text-neutral-500"}
                        >
                          Reply
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTarget(item);
                            setReplyTarget(null);
                            setInput(String(item.message_text || "").trim());
                            setSelectedFile(null);
                            setPreviewUrl(null);
                          }}
                          className={isUser ? "text-white/80" : "text-neutral-500"}
                        >
                          Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={async () => {
                            setDeleteTarget(item);
                          }}
                          className={isUser ? "text-white/80" : "text-neutral-500"}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {editingTarget ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold uppercase tracking-[0.2em]">Editing message</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-amber-700">
                  {String(editingTarget.message_text || "").trim() || "Message"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTarget(null);
                  setInput("");
                }}
                className="text-xs font-semibold text-amber-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {!editingTarget && replyTarget ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold uppercase tracking-[0.2em]">Replying to</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-neutral-600">
                  {replyTarget.sender_type === "user" ? customerName : agentName} ·{" "}
                  {String(replyTarget.message_text || replyTarget.reply_to_text || "").trim() || "Message"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="text-xs font-semibold text-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {previewUrl ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={previewUrl} alt="Upload preview" className="h-16 w-16 rounded-xl object-cover" />
                <div>
                  <p className="text-xs font-semibold text-neutral-700">
                    {uploadState === "compressing"
                      ? "Optimizing image…"
                      : uploadState === "uploading"
                        ? "Uploading image…"
                        : uploadState === "ready"
                          ? "Image ready"
                          : uploadState === "error"
                            ? "Upload failed"
                            : "Image selected"}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    {uploadError || selectedFile?.name || "attachment"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setUploadedFile(null);
                  setUploadState("idle");
                  setUploadError(null);
                }}
                className="btn btn-ghost px-3 py-1 text-xs"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSend} className="mt-4 flex items-center gap-2">
          <div className="relative flex-1 rounded-2xl ring-1 ring-transparent focus-within:ring-[rgba(45,52,97,0.18)] focus-within:shadow-[0_0_0_4px_rgba(45,52,97,0.18)]">
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
                  setUploadedFile(null);
                  setUploadState("idle");
                  setUploadError(null);
                  void uploadImage(file);
                }}
                disabled={locked || sending || !!editingTarget}
              />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              placeholder={
                locked
                  ? "Chat disabled for this project"
                  : editingTarget
                    ? "Edit your message"
                    : "Type your message"
              }
              className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-11 pr-4 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
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
      </div>

      {escalateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close escalation modal"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setEscalateOpen(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                    {escalateKind === "report" ? "Report agent" : "Escalate"}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                    {escalateKind === "report" ? "Report this conversation" : "Escalate this conversation"}
                  </h2>
                </div>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-600"
                  onClick={() => setEscalateOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                {escalateKind === "report"
                  ? "Report an agent for inappropriate behavior. This is private and the agent will not see it."
                  : "Escalate if you feel stuck or you need urgent attention. This is private and the agent will not see it."}
              </p>

              {escalateError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {escalateError}
                </div>
              ) : null}

              {escalateSuccess ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Thanks. Our team will review it shortly.
                </div>
              ) : null}

              <div className="mt-4">
                <label className="text-xs font-semibold text-neutral-600">Message (optional)</label>
                <textarea
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  className="mt-2 min-h-[96px] w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Add a short note for our team"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setEscalateOpen(false)}
                className="btn btn-outline px-4 py-2 text-xs"
                disabled={escalateSending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (escalateSending) return;
                  try {
                    setEscalateSending(true);
                    setEscalateError(null);
                    await sendEscalation({
                      kind: escalateKind,
                      conversation_id: conversationId,
                      handoff_id: data?.meta?.handoff_id ?? null,
                      reason: escalateReason.trim() || null,
                    });
                    setEscalateSuccess(true);
                  } catch (e: any) {
                    setEscalateError(e?.message || "Could not send. Please try again.");
                  } finally {
                    setEscalateSending(false);
                  }
                }}
                className="btn btn-primary px-4 py-2 text-xs"
                disabled={escalateSending}
              >
                {escalateSending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close delete modal"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                    Delete message
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-neutral-900">Delete this message?</h2>
                </div>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-600"
                  onClick={() => setDeleteTarget(null)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-3 text-sm text-neutral-600">
                This message will be removed from the chat for both you and your agent.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn btn-outline px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (!target) return;
                  const res = await authFetch("/api/mobile/paid-chat/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      conversation_id: conversationId,
                      message_id: target.id,
                    }),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok || !json?.ok) {
                    setMessage(json?.error || "Unable to delete message.");
                    return;
                  }
                  await reloadMessages();
                }}
                className="btn btn-primary px-4 py-2 text-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
