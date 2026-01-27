"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

function badgeBase() {
  return "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none";
}

export default function PaidChatInboxPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const [me, setMe] = useState<MeRes | null>(null);

  // per-conversation action loading + error
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [rowNote, setRowNote] = useState<Record<number, string>>({});

  const canLoadMore = useMemo(() => nextCursor != null, [nextCursor]);
  const authed = !!(me && "ok" in me && me.ok);
  const myId = authed ? (me as any).user.id : null;
  const myUsername = authed ? (me as any).user.username : null;
  const myRole = authed ? ((me as any).user.role as "admin" | "agent") : null;
  const isAdmin = myRole === "admin";

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

  function RowShell({
    disabled,
    href,
    children,
    title,
  }: {
    disabled: boolean;
    href: string;
    children: React.ReactNode;
    title?: string;
  }) {
    const base = "block border-b border-neutral-800 px-3 py-3 sm:px-4";
    const enabled = "active:bg-neutral-800 hover:bg-neutral-900/40";
    const disabledCls = "opacity-60";

    if (disabled) {
      return (
        <div className={`${base} ${disabledCls}`} title={title || ""}>
          {children}
        </div>
      );
    }

    return (
      <Link href={href} className={`${base} ${enabled}`}>
        {children}
      </Link>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">Paid Chats</h1>

          <button
            onClick={() => {
              loadMe();
              load(true);
            }}
            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs active:scale-[0.99]"
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

              const assignedId = it.assigned_agent_id;
              const assignedName = it.assigned_agent_username;

              const assignedToYou =
                myId != null &&
                assignedId != null &&
                Number(assignedId) === Number(myId);

              const assignedToOther =
                assignedId != null &&
                myId != null &&
                Number(assignedId) !== Number(myId);

              const linkDisabled = !isAdmin && assignedToOther;

              const assignedBadge = assignedId ? (
                <span
                  className={[
                    badgeBase(),
                    assignedToYou
                      ? "border-emerald-900/40 bg-emerald-950/30 text-emerald-200"
                      : "border-sky-900/40 bg-sky-950/30 text-sky-200",
                  ].join(" ")}
                >
                  Assigned to:{" "}
                  {assignedToYou
                    ? `${assignedName || myUsername || `ID ${assignedId}`} (you)`
                    : assignedName || `ID ${assignedId}`}
                </span>
              ) : (
                <span
                  className={[
                    badgeBase(),
                    "border-amber-900/40 bg-amber-950/30 text-amber-200",
                  ].join(" ")}
                >
                  Unassigned
                </span>
              );

              const showClaim = assignedId == null;
              const showTakeover =
                isAdmin && assignedId != null && !assignedToYou;
              const showLocked =
                !isAdmin && assignedId != null && !assignedToYou;

              const note = rowNote[convId];
              const isBusy = !!busy[convId];

              // ✅ unread indicator only matters if the row is actionable for you/admin
              const showUnread = it.is_unread && !linkDisabled;

              return (
                <RowShell
                  key={String(convId)}
                  disabled={linkDisabled}
                  href={`/internal/paid-chat/${convId}`}
                  title={linkDisabled ? "Locked: assigned to another agent" : ""}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        {/* ✅ unread dot */}
                        <div className="mt-2 shrink-0">
                          {showUnread ? (
                            <span className="block h-2.5 w-2.5 rounded-full bg-amber-400" />
                          ) : (
                            <span className="block h-2.5 w-2.5 rounded-full bg-transparent" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {title}
                          </div>
                          <div className="mt-1 truncate text-xs text-neutral-400">
                            {it.last_message_text || "No messages yet"}
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {showClaim ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                claimOrTakeover(convId);
                              }}
                              disabled={isBusy || !authed}
                              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 text-[12px] font-semibold text-neutral-100 active:scale-[0.99] disabled:opacity-60"
                            >
                              {isBusy ? "…" : "Claim"}
                            </button>
                          ) : showTakeover ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                claimOrTakeover(convId);
                              }}
                              disabled={isBusy || !authed}
                              className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-1.5 text-[12px] font-semibold text-red-200 active:scale-[0.99] disabled:opacity-60"
                            >
                              {isBusy ? "…" : "Take over"}
                            </button>
                          ) : showLocked ? (
                            <span
                              className={[
                                badgeBase(),
                                "border-neutral-700 bg-neutral-900/60 text-neutral-300",
                              ].join(" ")}
                            >
                              Locked
                            </span>
                          ) : null}

                          <div className="text-[11px] text-neutral-500">
                            {formatTime(it.last_message_at || it.updated_at)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            badgeBase(),
                            "border-neutral-800 bg-neutral-900/60 text-neutral-300",
                          ].join(" ")}
                        >
                          {it.route_type || "unknown"}
                        </span>

                        <span
                          className={[
                            badgeBase(),
                            "border-neutral-800 bg-neutral-900/60 text-neutral-400",
                          ].join(" ")}
                        >
                          {it.status || "active"}
                        </span>

                        {assignedBadge}

                        {/* ✅ unread badge */}
                        {showUnread ? (
                          <span
                            className={[
                              badgeBase(),
                              "border-amber-900/40 bg-amber-950/30 text-amber-200",
                            ].join(" ")}
                          >
                            Unread
                          </span>
                        ) : null}

                        {note ? (
                          <span
                            className={[
                              badgeBase(),
                              "border-neutral-700 bg-neutral-900/60 text-neutral-200",
                            ].join(" ")}
                          >
                            {note}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </RowShell>
              );
            })}
          </div>
        )}

        {canLoadMore && (
          <button
            onClick={() => load(false)}
            className="mt-4 w-full rounded-xl border border-neutral-800 py-2 text-sm active:scale-[0.99]"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}