"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Mail,
  Users,
  UserCheck,
  Search,
  RefreshCw,
} from "lucide-react";
import styles from "./PaidChat.module.css";
import ConfirmModal from "../_components/ConfirmModal";

type MeRes =
  | {
      ok: true;
      user: {
        id: number;
        username: string;
        role: "admin" | "agent";
      };
    }
  | { ok: false; error: string };

type InboxItemRaw = {
  conversation_id?: number;
  id?: number;

  route_type?: string;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;

  updated_at?: string;
  last_message_at?: string | null;
  last_message_text?: string | null;

  // ✅ unread signal from API
  is_unread?: number | boolean | null;

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

  // ✅ normalized unread
  is_unread: boolean;

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

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function normalizeRow(r: InboxItemRaw): InboxItem | null {
  const convId =
    typeof r.conversation_id === "number"
      ? r.conversation_id
      : typeof r.id === "number"
        ? r.id
        : 0;

  if (!convId) return null;

  const unread =
    r.is_unread === true ||
    r.is_unread === 1 ||
    String(r.is_unread || "").toLowerCase() === "true";

  return {
    conversation_id: convId,
    route_type: String(r.route_type || ""),
    assigned_agent_id:
      typeof r.assigned_agent_id === "number" ? r.assigned_agent_id : null,
    assigned_agent_username:
      typeof r.assigned_agent_username === "string" &&
      r.assigned_agent_username.trim()
        ? r.assigned_agent_username.trim()
        : null,
    updated_at: String(r.updated_at || ""),
    last_message_at: r.last_message_at ? String(r.last_message_at) : null,
    last_message_text: r.last_message_text ? String(r.last_message_text) : null,
    is_unread: unread,
    customer_name: r.customer_name ? String(r.customer_name) : null,
    customer_email: r.customer_email ? String(r.customer_email) : null,
    customer_whatsapp: r.customer_whatsapp ? String(r.customer_whatsapp) : null,
    status: r.status ? String(r.status) : null,
  };
}

export default function PaidChatInboxPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const [me, setMe] = useState<MeRes | null>(null);

  // per-conversation action loading + error
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [rowNote, setRowNote] = useState<Record<number, string>>({});
  const [confirmTakeoverId, setConfirmTakeoverId] = useState<number | null>(
    null,
  );

  const canLoadMore = useMemo(() => nextCursor != null, [nextCursor]);
  const authed = !!(me && "ok" in me && me.ok);
  const myId = me?.ok ? me.user.id : null;
  const myRole = me?.ok ? me.user.role : null;
  const isAdmin = myRole === "admin";

  const inboxStats = useMemo(() => {
    const total = items.length;
    const unassigned = items.filter((i) => i.assigned_agent_id == null).length;
    const assignedToMe =
      myId != null
        ? items.filter(
            (i) =>
              i.assigned_agent_id != null &&
              Number(i.assigned_agent_id) === Number(myId),
          ).length
        : 0;
    const unread = items.filter((i) => i.is_unread).length;
    return { total, unassigned, assignedToMe, unread };
  }, [items, myId]);

  async function loadMe() {
    try {
      const res = await fetch("/internal/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as MeRes | null;
      if (data) setMe(data);
      else setMe({ ok: false, error: "Failed to load session" });
    } catch {
      setMe({ ok: false, error: "Failed to load session" });
    }
  }

  async function load(reset = false) {
    setErr(null);
    setLoading(true);

    if (reset) {
      setLoading(true);
      setCursor(0);
      setNextCursor(null);
    }

    try {
      const useCursor = reset ? 0 : cursor;
      const res = await fetch(
        `/api/internal/paid-chat/inbox?cursor=${useCursor}&limit=25`,
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
        for (const p of reset ? [] : prev) map.set(p.conversation_id, p);
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

  async function claimOrTakeover(conversationId: number) {
    if (!conversationId) return;

    setBusy((p) => ({ ...p, [conversationId]: true }));
    setRowNote((p) => ({ ...p, [conversationId]: "" }));

    try {
      const res = await fetch("/api/internal/paid-chat/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const data: ClaimRes | null = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setRowNote((p) => ({
          ...p,
          [conversationId]: data?.error || `Action failed (${res.status})`,
        }));
        return;
      }

      await load(true);

      const note = data.taken_over
        ? "Taken over."
        : data.claimed
          ? "Assigned to you."
          : data.already_assigned
            ? "Already assigned."
            : "";

      if (note) {
        setRowNote((p) => ({ ...p, [conversationId]: note }));
        setTimeout(() => {
          setRowNote((prev) => {
            const copy = { ...prev };
            delete copy[conversationId];
            return copy;
          });
        }, 1800);
      }
    } catch {
      setRowNote((p) => ({ ...p, [conversationId]: "Network error" }));
    } finally {
      setBusy((p) => ({ ...p, [conversationId]: false }));
    }
  }

  useEffect(() => {
    loadMe();
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matches =
          `${item.customer_name || ""} ${item.customer_email || ""} ${item.customer_whatsapp || ""} ${item.conversation_id} ${item.last_message_text || ""}`
            .toLowerCase()
            .includes(query.toLowerCase().trim());
        return (
          matches &&
          (filter === "all" ||
            (filter === "unread" && item.is_unread) ||
            (filter === "unassigned" && item.assigned_agent_id == null) ||
            (filter === "mine" && item.assigned_agent_id === myId))
        );
      }),
    [items, query, filter, myId],
  );

  return (
    <div className={styles.inbox}>
      <div className={styles.heading}>
        <div>
          <h2>Conversation inbox</h2>
          <p>
            Keep customer conversations moving, from first question to a clear
            next step.
          </p>
        </div>
        <button
          className={styles.action}
          disabled={loading}
          onClick={() => {
            loadMe();
            load(true);
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className={styles.metrics}>
        {(
          [
            ["Conversations loaded", inboxStats.total, MessageSquare],
            ["Unread", inboxStats.unread, Mail],
            ["Awaiting assignment", inboxStats.unassigned, Users],
            ["Assigned to you", inboxStats.assignedToMe, UserCheck],
          ] as const
        ).map(([label, count, Icon]) => (
          <div key={label}>
            <span>
              <Icon size={18} aria-hidden="true" />
              {label}
            </span>
            <strong>{loading && !items.length ? "—" : count}</strong>
          </div>
        ))}
      </div>
      <section
        className={styles.panel}
        aria-label="Paid conversations"
        aria-busy={loading}
      >
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Filter conversations">
            {(
              [
                ["all", "All conversations"],
                ["unread", "Unread"],
                ["unassigned", "Unassigned"],
                ["mine", "Assigned to me"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search loaded conversations"
              placeholder="Search customer or message…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.listCaption}>
          <span>
            {filteredItems.length} of {items.length} loaded conversations
          </span>
          <span>Search and counts cover loaded conversations</span>
        </div>
        {err ? (
          <div className={styles.notice} role="alert">
            {err} <button onClick={() => load(true)}>Try again</button>
          </div>
        ) : null}
        {loading && !items.length ? (
          <div className={styles.empty} role="status">
            <MessageSquare size={28} />
            <h3>Loading conversations</h3>
            <p>Your inbox will appear here shortly.</p>
          </div>
        ) : !filteredItems.length ? (
          <div className={styles.empty}>
            <MessageSquare size={28} />
            <h3>
              {items.length
                ? "No matching conversations"
                : "Your inbox is clear"}
            </h3>
            <p>
              {items.length
                ? "Try another name, message or filter."
                : "Paid customer conversations will appear here when they begin."}
            </p>
            {items.length > 0 && (
              <button
                className={styles.action}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {filteredItems.map((item) => {
              const id = item.conversation_id;
              const mine = item.assigned_agent_id === myId;
              const locked =
                !isAdmin && item.assigned_agent_id != null && !mine;
              const title =
                item.customer_name ||
                item.customer_email ||
                item.customer_whatsapp ||
                `Conversation #${id}`;
              return (
                <article
                  key={id}
                  className={styles.row}
                  data-unread={item.is_unread && !locked}
                >
                  <div className={styles.avatar} aria-hidden="true">
                    {title.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.rowContent}>
                    <div className={styles.rowTitle}>
                      {locked ? (
                        <strong>{title}</strong>
                      ) : (
                        <Link href={`/internal/paid-chat/${id}`}>{title}</Link>
                      )}
                      {item.is_unread && !locked && (
                        <span className={styles.unread}>Unread</span>
                      )}
                      <small>#{id}</small>
                    </div>
                    <p className={styles.preview}>
                      {item.last_message_text || "No messages yet"}
                    </p>
                    <div className={styles.meta}>
                      <span>
                        {(item.route_type || "General enquiry").replaceAll(
                          "_",
                          " ",
                        )}
                      </span>
                      <span>{item.status || "Active"}</span>
                      <span>
                        {item.assigned_agent_id == null
                          ? "Awaiting assignment"
                          : mine
                            ? "Assigned to you"
                            : `Assigned to ${item.assigned_agent_username || "another agent"}`}
                      </span>
                    </div>
                    {rowNote[id] && (
                      <p role="status" className={styles.rowNote}>
                        {rowNote[id]}
                      </p>
                    )}
                  </div>
                  <div className={styles.rowActions}>
                    <time>
                      {formatTime(item.last_message_at || item.updated_at)}
                    </time>
                    <div>
                      {item.assigned_agent_id == null ? (
                        <button
                          className={styles.primary}
                          disabled={busy[id] || !authed}
                          onClick={() => claimOrTakeover(id)}
                        >
                          {busy[id] ? "Assigning…" : "Assign to me"}
                        </button>
                      ) : isAdmin && !mine ? (
                        <button
                          className={styles.action}
                          disabled={busy[id]}
                          onClick={() => setConfirmTakeoverId(id)}
                        >
                          Take over
                        </button>
                      ) : null}
                      {locked ? (
                        <span className={styles.locked}>
                          Assigned to another agent
                        </span>
                      ) : (
                        <Link
                          className={styles.action}
                          href={`/internal/paid-chat/${id}`}
                        >
                          Open chat
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {canLoadMore && (
          <div className={styles.loadMore}>
            <button
              className={styles.action}
              disabled={loading}
              onClick={() => load(false)}
            >
              {loading ? "Loading…" : "Load more conversations"}
            </button>
          </div>
        )}
      </section>
      <ConfirmModal
        open={confirmTakeoverId != null}
        title="Take over this conversation?"
        description="This will assign the conversation to you and notify the customer."
        confirmText="Take over"
        onCancel={() => setConfirmTakeoverId(null)}
        onConfirm={async () => {
          if (confirmTakeoverId != null)
            await claimOrTakeover(confirmTakeoverId);
          setConfirmTakeoverId(null);
        }}
      />
    </div>
  );
}
