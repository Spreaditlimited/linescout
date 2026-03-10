"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type QuickChatRow = {
  id: number;
  route_type: "machine_sourcing" | "white_label" | "simple_sourcing" | string;
  human_message_limit: number;
  human_message_used: number;
  human_access_expires_at: string | null;
  updated_at: string;
  created_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

function routeLabel(routeType: string) {
  if (routeType === "white_label") return "White Label";
  if (routeType === "simple_sourcing") return "Simple Sourcing";
  return "Machine Sourcing";
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

export default function QuickChatsPage() {
  const router = useRouter();
  const [items, setItems] = useState<QuickChatRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const hasItems = useMemo(() => items.length > 0, [items]);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);
      const res = await authFetch("/api/mobile/quick-chats");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load quick chats.");
        }
        return;
      }
      if (!active) return;
      setItems(Array.isArray(json?.items) ? json.items : []);
      setStatus("idle");
    }
    load();
    const t = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Quick Chats</h1>
          <p className="mt-1 text-sm text-neutral-600">Active specialist quick chats awaiting your response.</p>
        </div>
        <Link href="/machine" className="btn btn-outline px-4 py-2 text-xs">
          Open AI Chat
        </Link>
      </div>

      <div className="mt-6 grid gap-4">
        {status === "loading" ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-600">Loading quick chats…</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {status === "idle" && !hasItems ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-sm">
            No active quick chats right now.
          </div>
        ) : null}

        {items.map((item) => {
          const remaining = Math.max(
            Number(item.human_message_limit || 0) - Number(item.human_message_used || 0),
            0
          );
          const expiry = timeUntilSafe(item.human_access_expires_at);
          return (
            <Link
              key={item.id}
              href={`/quick-chat?route_type=${encodeURIComponent(String(item.route_type || "machine_sourcing"))}&conversation_id=${item.id}`}
              className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(45,52,97,0.2)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                    {routeLabel(String(item.route_type || ""))}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-neutral-900">Quick Chat #{item.id}</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    {String(item.last_message_text || "").trim() || "No messages yet."}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  {remaining} replies left · expires in {expiry}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
