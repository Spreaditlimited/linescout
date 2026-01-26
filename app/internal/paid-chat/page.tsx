"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type InboxItemRaw = {
  // API might return either:
  conversation_id?: number;
  id?: number;

  route_type?: string;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;

  updated_at?: string;
  last_message_at?: string | null;
  last_message_text?: string | null;

  customer_name?: string | null;
  customer_email?: string | null;
  customer_whatsapp?: string | null;

  status?: string | null;
};

type InboxItem = {
  conversation_id: number;
  route_type: string;
  assigned_agent_id: number | null;
  assigned_agent_username: string | null;
  updated_at: string;
  last_message_at: string | null;
  last_message_text: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  status: string | null;
};

type InboxRes = {
  ok: boolean;
  items: InboxItemRaw[];
  next_cursor?: number | null;
  error?: string;
};

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function normalizeRow(r: InboxItemRaw): InboxItem | null {
  const convId =
    typeof r.conversation_id === "number"
      ? r.conversation_id
      : typeof r.id === "number"
      ? r.id
      : 0;

  if (!convId) return null;

  return {
    conversation_id: convId,
    route_type: String(r.route_type || ""),
    assigned_agent_id:
      typeof r.assigned_agent_id === "number" ? r.assigned_agent_id : null,
    assigned_agent_username:
      typeof r.assigned_agent_username === "string" && r.assigned_agent_username.trim()
        ? r.assigned_agent_username.trim()
        : null,
    updated_at: String(r.updated_at || ""),
    last_message_at: r.last_message_at ? String(r.last_message_at) : null,
    last_message_text: r.last_message_text ? String(r.last_message_text) : null,
    customer_name: r.customer_name ? String(r.customer_name) : null,
    customer_email: r.customer_email ? String(r.customer_email) : null,
    customer_whatsapp: r.customer_whatsapp ? String(r.customer_whatsapp) : null,
    status: r.status ? String(r.status) : null,
  };
}

export default function PaidChatInboxPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const canLoadMore = useMemo(() => nextCursor != null, [nextCursor]);

  async function load(reset = false) {
    setErr(null);

    if (reset) {
      setLoading(true);
      setCursor(0);
      setNextCursor(null);
      setItems([]);
    }

    try {
      const useCursor = reset ? 0 : cursor;

      const res = await fetch(
        `/api/internal/paid-chat/inbox?cursor=${useCursor}&limit=25`
      );

      const data: InboxRes | null = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "Failed to load inbox");
        return;
      }

      const normalized = (Array.isArray(data.items) ? data.items : [])
        .map(normalizeRow)
        .filter(Boolean) as InboxItem[];

      setItems((prev) => {
        const map = new Map<number, InboxItem>();
        for (const p of prev) map.set(p.conversation_id, p);
        for (const n of normalized) map.set(n.conversation_id, n);
        return Array.from(map.values());
      });

      const nc = typeof data.next_cursor === "number" ? data.next_cursor : null;
      setCursor(nc ?? cursor);
      setNextCursor(nc);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">Paid Chats</h1>

          <button
            onClick={() => load(true)}
            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-8 text-center text-sm text-neutral-400">Loading…</div>
        ) : err ? (
          <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm">
            {err}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 text-center text-sm text-neutral-400">
            No paid chats yet
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            {items.map((it) => {
              const convId = it.conversation_id;

              const title =
                it.customer_name ||
                it.customer_email ||
                it.customer_whatsapp ||
                `Conversation #${convId}`;

              const assignedLabel = it.assigned_agent_id
                ? `Assigned to: ${it.assigned_agent_username || `ID ${it.assigned_agent_id}`}`
                : "Unassigned";

              return (
                <Link
                  key={String(convId)}
                  href={`/internal/paid-chat/${convId}`}
                  className="block border-b border-neutral-800 px-3 py-3 active:bg-neutral-800 sm:px-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{title}</div>

                      <div className="mt-1 truncate text-xs text-neutral-400">
                        {it.last_message_text || "No messages yet"}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                        <span className="truncate">{it.route_type}</span>
                        <span>•</span>
                        <span>{it.status || "active"}</span>
                        <span>•</span>
                        <span className="truncate">{assignedLabel}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-[11px] text-neutral-500">
                      {formatTime(it.last_message_at || it.updated_at)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {canLoadMore && (
          <button
            onClick={() => load(false)}
            className="mt-4 w-full rounded-xl border border-neutral-800 py-2 text-sm"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}