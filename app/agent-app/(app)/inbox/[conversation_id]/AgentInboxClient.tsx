"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AgentAppShell from "../../_components/AgentAppShell";
import { ImagePlus, Send, X } from "lucide-react";

type Msg = {
  id: number;
  conversation_id: number;
  sender_type: "user" | "ai" | "agent" | "system";
  sender_id: number | null;
  message_text: string | null;
  reply_to_message_id?: number | null;
  reply_to_sender_type?: "user" | "agent" | "ai" | string | null;
  reply_to_text?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
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
    can_send?: boolean;
    send_blocked_reason?: string | null;
    customer_name?: string | null;
    agent_name?: string | null;
    handoff_context?: string | null;
  };
  attachments_by_message_id?: Record<string, Attachment[]>;
  items: Msg[];
  last_id: number;
  error?: string;
};

type SendRes = {
  ok: boolean;
  item?: Msg | null;
  attachments?: Attachment[] | null;
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

type Attachment = {
  id: number;
  message_id: number;
  kind: string | null;
  original_filename: string | null;
  secure_url: string | null;
  mime_type: string | null;
};

const URL_RE = /(https?:\/\/[^\s]+)/g;

function fmtTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function renderMessageWithLinks(text: string | null) {
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
  const isQuick = kind === "quick";

  const [bootErr, setBootErr] = useState<string | null>(null);
  const [items, setItems] = useState<Msg[]>([]);
  const [visibleCount, setVisibleCount] = useState(Number.MAX_SAFE_INTEGER);
  const [lastId, setLastId] = useState<number>(0);
  const lastIdRef = useRef<number>(0);
  const lastReadRef = useRef<number>(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [claimNote, setClaimNote] = useState<string>("");
  const [assignedAgentId, setAssignedAgentId] = useState<number | null>(null);
  const [assignedAgentUsername, setAssignedAgentUsername] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [sendBlockedReason, setSendBlockedReason] = useState<string>("");
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Record<string, Attachment[]>>({});
  const [customerName, setCustomerName] = useState<string>("Customer");
  const [agentName, setAgentName] = useState<string>("You");
  const [handoffContext, setHandoffContext] = useState<string>("");
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [adminSenderIds, setAdminSenderIds] = useState<number[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Msg | null>(null);
  const [editingTarget, setEditingTarget] = useState<Msg | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Msg | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "compressing" | "uploading" | "ready" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<any | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);

  const canSendNow = useMemo(() => (!!input.trim() || !!selectedFile) && !sending, [input, selectedFile, sending]);

  useEffect(() => {
    lastIdRef.current = lastId;
  }, [lastId]);

  useEffect(() => {
    if (!conversationId) return;
    setVisibleCount(Number.MAX_SAFE_INTEGER);
  }, [conversationId]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(48, Math.min(el.scrollHeight, 96))}px`;
  }, [input]);

  useEffect(() => {
    const latest = lastIdRef.current;
    if (!conversationId || !latest || latest <= lastReadRef.current) return;
    lastReadRef.current = latest;
    const endpoint = isQuick ? "/api/agent/quick-human/read" : "/api/internal/paid-chat/read";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ conversation_id: conversationId, last_seen_message_id: latest }),
    }).catch(() => {});
  }, [conversationId, isQuick, lastId]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    });
  }

  function maybeScrollToBottom(behavior: ScrollBehavior = "smooth") {
    const runInitial = !initialScrollDoneRef.current;
    if (!runInitial && !shouldStickToBottomRef.current) return;
    scrollToBottom(runInitial ? "auto" : behavior);
    if (runInitial) initialScrollDoneRef.current = true;
  }

  function forceStickToBottom(behavior: ScrollBehavior = "smooth") {
    shouldStickToBottomRef.current = true;
    maybeScrollToBottom(behavior);
  }

  async function fetchNew(after: number): Promise<{
    rows: Msg[];
    last: number;
    assigned_agent_id: number | null;
    assigned_agent_username: string | null;
    can_send: boolean;
    send_blocked_reason: string;
    customer_name: string;
    agent_name: string;
    handoff_context: string;
    agent_name_map: Record<string, string>;
    admin_sender_ids: number[];
    attachments_by_message_id: Record<string, Attachment[]>;
  }> {
    const endpoint = isQuick ? "/api/agent/quick-human/messages" : "/api/internal/paid-chat/messages";
    const res = await fetch(
      `${endpoint}?conversation_id=${conversationId}&after_id=${after}&limit=120`,
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

    const can_send = isQuick ? true : data?.meta?.can_send !== false;
    const send_blocked_reason = isQuick ? "" : String(data?.meta?.send_blocked_reason || "").trim();
    const customer_name = String(data?.meta?.customer_name || "Customer").trim() || "Customer";
    const agent_name = String(data?.meta?.agent_name || "You").trim() || "You";
    const handoff_context = String(data?.meta?.handoff_context || "").trim();
    const attachments_by_message_id =
      typeof data?.attachments_by_message_id === "object" && data.attachments_by_message_id
        ? data.attachments_by_message_id
        : {};
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
      can_send,
      send_blocked_reason,
      customer_name,
      agent_name,
      handoff_context,
      agent_name_map,
      admin_sender_ids,
      attachments_by_message_id,
    };
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
    initialScrollDoneRef.current = false;
    shouldStickToBottomRef.current = true;

    (async () => {
      try {
        setBootErr(null);
        const initial = await fetchNew(0);
        if (cancelled) return;

        setAssignedAgentId(initial.assigned_agent_id);
        setAssignedAgentUsername(initial.assigned_agent_username);
        setCanSend(initial.can_send);
        setSendBlockedReason(initial.send_blocked_reason);
        setCustomerName(initial.customer_name);
        setAgentName(initial.agent_name);
        setHandoffContext(initial.handoff_context || "");
        setAgentNameMap(initial.agent_name_map || {});
        setAdminSenderIds(initial.admin_sender_ids || []);
        setAttachmentsByMessageId(initial.attachments_by_message_id);

        setItems(initial.rows);
        setLastId(initial.last);
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
          can_send,
          send_blocked_reason,
          customer_name,
          agent_name,
          handoff_context,
          agent_name_map,
          admin_sender_ids,
          attachments_by_message_id,
        } =
          await fetchNew(after);

        setAssignedAgentId(assigned_agent_id);
        setAssignedAgentUsername(assigned_agent_username);
        setCanSend(can_send);
        setSendBlockedReason(send_blocked_reason);
        setCustomerName(customer_name);
        setAgentName(agent_name);
        if (handoff_context) setHandoffContext(handoff_context);
        if (agent_name_map && Object.keys(agent_name_map).length) {
          setAgentNameMap((prev) => ({ ...prev, ...agent_name_map }));
        }
        if (admin_sender_ids.length) {
          setAdminSenderIds((prev) => {
            const merged = new Set<number>([...prev, ...admin_sender_ids]);
            return Array.from(merged);
          });
        }
        if (Object.keys(attachments_by_message_id).length) {
          setAttachmentsByMessageId((prev) => ({ ...prev, ...attachments_by_message_id }));
        }

        if (!rows.length) return;

        setItems((prev) => {
          const incoming = rows || [];
          if (!incoming.length) return prev;
          const incomingKeys = new Set(
            incoming.map(
              (r) =>
                `${r.sender_type}|${String(r.message_text || "").trim()}|${Number(
                  r.reply_to_message_id || 0
                )}`
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
          for (const r of incoming) {
            if (!seen.has(r.id)) merged.push(r);
          }
          return merged;
        });

        setLastId(last);
        maybeScrollToBottom();
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

  useEffect(() => {
    if (!items.length) return;
    maybeScrollToBottom();
  }, [items.length, visibleCount, conversationId]);

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
      const uploadRes = await fetch("/api/internal/paid-chat/upload", {
        method: "POST",
        credentials: "include",
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

  async function send() {
    if (editingTarget && !isQuick) {
      const text = input.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        const res = await fetch("/api/internal/paid-chat/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            conversation_id: conversationId,
            message_id: editingTarget.id,
            message_text: text,
          }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setClaimNote(data?.error || "Unable to edit message.");
          return;
        }
        setInput("");
        setEditingTarget(null);
        const refreshed = await fetchNew(0);
        setItems(refreshed.rows);
        setLastId(refreshed.last);
        setAssignedAgentId(refreshed.assigned_agent_id);
        setAssignedAgentUsername(refreshed.assigned_agent_username);
        setCanSend(refreshed.can_send);
        setSendBlockedReason(refreshed.send_blocked_reason);
        setCustomerName(refreshed.customer_name);
        setAgentName(refreshed.agent_name);
        setAgentNameMap(refreshed.agent_name_map || {});
        setAttachmentsByMessageId(refreshed.attachments_by_message_id || {});
        forceStickToBottom("auto");
      } finally {
        setSending(false);
      }
      return;
    }

    setReplyTarget(null);
    const text = input.trim();
    if ((!text && !selectedFile && !uploadedFile) || !canSendNow || !canSend) return;

    setSending(true);
    setInput("");

    const optimisticId = Date.now() * 1000;
    const optimistic: Msg = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: null,
      message_text: text || null,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, optimistic]);
    forceStickToBottom("auto");

    try {
      let attachmentPayload: any = null;
      if (uploadedFile) {
        attachmentPayload = { file: uploadedFile };
      } else if (selectedFile) {
        const nextFile = await uploadImage(selectedFile);
        if (nextFile) attachmentPayload = { file: nextFile };
        if (!attachmentPayload) {
          setClaimNote(uploadError || "Unable to upload image.");
          setSending(false);
          return;
        }
      }

      const sendEndpoint = isQuick ? "/api/agent/quick-human/send" : "/api/internal/paid-chat/send";
      const res = await fetch(sendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conversation_id: conversationId,
          message_text: text,
          reply_to_message_id: isQuick ? null : replyTarget?.id || null,
          ...(attachmentPayload || {}),
        }),
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
        const realId = Number(data.item!.id);
        const withoutReal = prev.filter((m) => m.id !== realId);
        const replaced = withoutReal.map((m) => (m.id === optimisticId ? data.item! : m));
        if (!replaced.some((m) => m.id === realId)) {
          replaced.push(data.item!);
        }
        const seen = new Set<number>();
        const dedup: Msg[] = [];
        for (let i = replaced.length - 1; i >= 0; i -= 1) {
          const msg = replaced[i];
          if (seen.has(msg.id)) continue;
          seen.add(msg.id);
          dedup.unshift(msg);
        }
        return dedup;
      });
      if (Array.isArray(data?.attachments) && data.attachments.length) {
        setAttachmentsByMessageId((prev) => ({
          ...prev,
          [String(data.item!.id)]: data.attachments || [],
        }));
      }

      const realId = Number(data.item.id || 0);
      if (realId > lastIdRef.current) {
        lastIdRef.current = realId;
        setLastId(realId);
      }

      forceStickToBottom("auto");
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
      setSelectedFile(null);
      setUploadedFile(null);
      setUploadState("idle");
      setUploadError(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
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
      <div className="flex h-[80vh] min-h-[70vh] max-h-[84vh] flex-col rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:h-[70vh] sm:min-h-[520px] sm:max-h-[74vh]">
        <div className="border-b border-[rgba(45,52,97,0.12)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              {assignmentLine}
              {claimNote ? ` • ${claimNote}` : ""}
            </p>
            {kind !== "quick" && !assignedAgentId ? (
              <button
                type="button"
                onClick={async () => {
                  await claimConversation();
                }}
                className="rounded-full border border-[rgba(45,52,97,0.2)] px-3 py-1 text-[11px] font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
              >
                Claim chat
              </button>
            ) : null}
          </div>
          {!canSend && sendBlockedReason ? (
            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              {sendBlockedReason}
            </div>
          ) : null}
        </div>

        {bootErr ? (
          <div className="p-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {bootErr}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={() => {
                const el = scrollRef.current;
                if (!el) return;
                const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                shouldStickToBottomRef.current = distanceFromBottom <= 120;
              }}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              <div className="w-full space-y-3">
                {[
                  ...(handoffContext && !isQuick
                    ? ([
                        {
                          id: -1,
                          conversation_id: conversationId,
                          sender_type: "system" as const,
                          sender_id: null,
                          message_text: handoffContext,
                          created_at: items[0]?.created_at || new Date().toISOString(),
                        },
                      ] as Msg[])
                    : []),
                  ...items.slice(Math.max(items.length - visibleCount, 0)),
                ].map((m, idx) => {
                  const isSystem = m.sender_type === "system";
                  const isAgent = m.sender_type === "agent";
                  const senderIdNum = Number(m.sender_id || 0);
                  const isAdminSender =
                    isAgent && senderIdNum > 0 && adminSenderIds.includes(senderIdNum);
                  const isDeleted = !!m.deleted_at;
                  if (isSystem) {
                    return (
                      <div key={`system-${idx}`} className="w-full">
                        <div className="w-full rounded-2xl border border-[rgba(45,52,97,0.16)] bg-[rgba(45,52,97,0.06)] px-4 py-3 text-sm text-neutral-700">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2D3461]">
                            Project context
                          </p>
                          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{m.message_text}</p>
                        </div>
                      </div>
                    );
                  }
                  const bubble = isAgent
                    ? isAdminSender
                      ? "ml-auto border border-amber-200 bg-amber-50 text-amber-900"
                      : "ml-auto bg-[#2D3461] text-white"
                    : "mr-auto bg-[#F4F7FB] text-neutral-800 border border-[rgba(45,52,97,0.12)]";

                  const metaColor = isAgent
                    ? isAdminSender
                      ? "text-amber-700"
                      : "text-white/70"
                    : "text-neutral-500";
                  const senderIdKey = m.sender_id != null ? String(m.sender_id) : "";
                  const agentLabel = senderIdKey && agentNameMap[senderIdKey] ? agentNameMap[senderIdKey] : agentName || "Agent";
                  const label =
                    m.sender_type === "ai"
                      ? "AI"
                      : m.sender_type === "user"
                      ? customerName || "Customer"
                      : isAdminSender
                        ? "Admin"
                        : agentLabel;

                  const attachments = isDeleted ? [] : attachmentsByMessageId[String(m.id)] || [];
                  const createdMs = m.created_at ? new Date(m.created_at).getTime() : 0;
                  const withinEditWindow = createdMs ? Date.now() - createdMs <= 24 * 60 * 60 * 1000 : false;
                  const replyLabel =
                    m.reply_to_sender_type === "user"
                      ? customerName || "Customer"
                      : m.reply_to_sender_type === "agent"
                        ? agentLabel
                        : m.reply_to_sender_type === "ai"
                          ? "AI"
                          : "Message";
                  const replyText = String(m.reply_to_text || "").trim() || "Message deleted";
                  const canReply = !isQuick && !isDeleted;
                  const canEdit =
                    !isQuick &&
                    isAgent &&
                    !isDeleted &&
                    !!m.message_text &&
                    (!assignedAgentId || Number(m.sender_id) === assignedAgentId) &&
                    attachments.length === 0 &&
                    withinEditWindow;
                  const canDelete =
                    !isQuick &&
                    isAgent &&
                    !isDeleted &&
                    (!assignedAgentId || Number(m.sender_id) === assignedAgentId) &&
                    withinEditWindow;
                  const timeLabel = `${fmtTime(m.created_at)}${m.edited_at ? " · Edited" : ""}`;

                  return (
                    <div
                      key={`${m.id}-${idx}`}
                      className={`w-fit max-w-[92%] sm:max-w-[86%] rounded-2xl px-3 py-2 ${bubble}`}
                    >
                      <div className={`text-[11px] ${metaColor} mb-1`}>
                        {label} • {timeLabel}
                      </div>
                      {m.reply_to_message_id ? (
                        <div
                          className={`mb-2 rounded-xl border px-3 py-2 text-[11px] ${
                            isAgent
                              ? "border-white/30 bg-white/10 text-white/80"
                              : "border-[rgba(45,52,97,0.2)] bg-white text-neutral-600"
                          }`}
                        >
                          <p className="font-semibold">{replyLabel}</p>
                          <p className="mt-1 line-clamp-2">{replyText}</p>
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                        {isDeleted ? (
                          <span className="italic opacity-80">Message deleted</span>
                        ) : (
                          renderMessageWithLinks(m.message_text)
                        )}
                      </div>
                      {attachments.length ? (
                        <div className="mt-2 grid gap-2">
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
                      {canReply || canEdit || canDelete ? (
                        <div className={`mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] ${metaColor}`}>
                          {canReply ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(m);
                                setEditingTarget(null);
                              }}
                            >
                              Reply
                            </button>
                          ) : null}
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTarget(m);
                                setReplyTarget(null);
                                setInput(String(m.message_text || "").trim());
                                setSelectedFile(null);
                                if (previewUrl) URL.revokeObjectURL(previewUrl);
                                setPreviewUrl(null);
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={async () => {
                                setDeleteTarget(m);
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[rgba(45,52,97,0.12)] px-3 py-3 sm:px-4">
              {editingTarget ? (
                <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
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
                <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
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
                <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
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
                        setUploadedFile(null);
                        setUploadState("idle");
                        setUploadError(null);
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }}
                      className="btn btn-ghost px-3 py-1 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : null}

              <form onSubmit={(e) => {
                e.preventDefault();
                send();
              }} className="flex w-full items-end gap-2">
                <label
                  aria-label="Add image"
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[#2D3461] ${
                    !canSend || sending || !!editingTarget
                      ? "cursor-not-allowed border-neutral-200 text-neutral-400"
                      : "cursor-pointer border-[rgba(45,52,97,0.2)] hover:bg-[rgba(45,52,97,0.08)]"
                  }`}
                >
                  <ImagePlus className="h-5 w-5" />
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
                    disabled={!canSend || sending || !!editingTarget}
                  />
                </label>
                <div className="flex-1 rounded-2xl">
                  <textarea
                    ref={composerRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "0px";
                      el.style.height = `${Math.max(48, Math.min(el.scrollHeight, 96))}px`;
                    }}
                    placeholder={editingTarget ? "Edit your message" : "Type your message"}
                    rows={1}
                    className="h-12 min-h-12 max-h-24 w-full resize-none overflow-y-auto rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                    disabled={!canSend || sending}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSendNow || !canSend}
                  className="btn btn-primary px-4 py-3 text-xs"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

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
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">
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
                This message will be removed from the chat for both you and the customer.
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
                  const res = await fetch("/api/internal/paid-chat/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      conversation_id: conversationId,
                      message_id: target.id,
                    }),
                  });
                  const data: any = await res.json().catch(() => ({}));
                  if (!res.ok || !data?.ok) {
                    setClaimNote(data?.error || "Unable to delete message.");
                    return;
                  }
                  const refreshed = await fetchNew(0);
                  setItems(refreshed.rows);
                  setLastId(refreshed.last);
                  setAssignedAgentId(refreshed.assigned_agent_id);
                  setAssignedAgentUsername(refreshed.assigned_agent_username);
                  setCanSend(refreshed.can_send);
                  setSendBlockedReason(refreshed.send_blocked_reason);
                  setCustomerName(refreshed.customer_name);
                  setAgentName(refreshed.agent_name);
                  setAgentNameMap(refreshed.agent_name_map || {});
                  setAttachmentsByMessageId(refreshed.attachments_by_message_id || {});
                  forceStickToBottom("auto");
                }}
                className="btn btn-primary px-4 py-2 text-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
