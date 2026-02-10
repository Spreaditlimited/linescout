"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AgentAppShell from "../../_components/AgentAppShell";
import { ImagePlus, Send } from "lucide-react";

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
  meta?: {
    can_send?: boolean;
    send_blocked_reason?: string | null;
    customer_name?: string | null;
    agent_name?: string | null;
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
  const isQuick = kind === "quick";

  const [bootErr, setBootErr] = useState<string | null>(null);
  const [items, setItems] = useState<Msg[]>([]);
  const [lastId, setLastId] = useState<number>(0);
  const lastIdRef = useRef<number>(0);
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const canSendNow = useMemo(() => (!!input.trim() || !!selectedFile) && !sending, [input, selectedFile, sending]);

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
    can_send: boolean;
    send_blocked_reason: string;
    customer_name: string;
    agent_name: string;
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
    const attachments_by_message_id =
      typeof data?.attachments_by_message_id === "object" && data.attachments_by_message_id
        ? data.attachments_by_message_id
        : {};

    return {
      rows,
      last,
      assigned_agent_id,
      assigned_agent_username,
      can_send,
      send_blocked_reason,
      customer_name,
      agent_name,
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
        setAttachmentsByMessageId(initial.attachments_by_message_id);

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
          can_send,
          send_blocked_reason,
          customer_name,
          agent_name,
          attachments_by_message_id,
        } =
          await fetchNew(after);

        setAssignedAgentId(assigned_agent_id);
        setAssignedAgentUsername(assigned_agent_username);
        setCanSend(can_send);
        setSendBlockedReason(send_blocked_reason);
        setCustomerName(customer_name);
        setAgentName(agent_name);
        if (Object.keys(attachments_by_message_id).length) {
          setAttachmentsByMessageId((prev) => ({ ...prev, ...attachments_by_message_id }));
        }

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
    if ((!text && !selectedFile) || !canSendNow || !canSend) return;

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
      let attachmentPayload: any = null;
      if (selectedFile) {
        const form = new FormData();
        form.append("conversation_id", String(conversationId));
        form.append("file", selectedFile);
        const uploadRes = await fetch("/api/internal/paid-chat/upload", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadJson?.ok) {
          setClaimNote(uploadJson?.error || "Unable to upload image.");
          setSending(false);
          return;
        }
        attachmentPayload = { file: uploadJson.file };
      }

      const sendEndpoint = isQuick ? "/api/agent/quick-human/send" : "/api/internal/paid-chat/send";
      const res = await fetch(sendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conversation_id: conversationId,
          message_text: text,
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

      setItems((prev) => prev.map((m) => (m.id === optimisticId ? data.item! : m)));
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
      setSelectedFile(null);
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
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mx-auto w-full max-w-3xl space-y-3">
                {items.map((m) => {
                  const isAgent = m.sender_type === "agent";
                  const bubble = isAgent
                    ? "ml-auto bg-[#2D3461] text-white"
                    : "mr-auto bg-[#F4F7FB] text-neutral-800 border border-[rgba(45,52,97,0.12)]";

                  const metaColor = isAgent ? "text-white/70" : "text-neutral-500";
                  const label =
                    m.sender_type === "ai"
                      ? "AI"
                      : m.sender_type === "user"
                      ? customerName || "Customer"
                      : agentName || "You";

                  const attachments = attachmentsByMessageId[String(m.id)] || [];

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
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[rgba(45,52,97,0.12)] px-3 py-3 sm:px-4">
              {previewUrl ? (
                <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
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
              }} className="mx-auto flex w-full max-w-3xl items-center gap-2">
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
                      }}
                      disabled={!canSend || sending}
                    />
                  </label>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message"
                    className="w-full rounded-2xl border border-neutral-200 bg-white py-4 pl-11 pr-4 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
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
