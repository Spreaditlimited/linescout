"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const shortDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type ConversationRow = {
  id: number;
  route_type: "machine_sourcing" | "white_label";
  title: string;
  chat_mode: string;
  payment_status: string;
  project_status: string;
  handoff_id: number | null;
  updated_at: string;
  created_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

export default function ConversationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  const [routeType, setRouteType] = useState<"machine_sourcing" | "white_label">(
    "machine_sourcing"
  );
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const paidOnly = useMemo(
    () => items.filter((item) => item.chat_mode === "paid_human" && item.payment_status === "paid"),
    [items]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);
      const res = await authFetch(`/api/mobile/conversations/list?route_type=${routeType}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load conversations.");
        }
        return;
      }

      if (active) {
        setItems(Array.isArray(json?.items) ? json.items : []);
        setStatus("idle");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [routeType, router]);

  return (
    <div className="px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Chats</h1>
          <p className="mt-1 text-sm text-neutral-600">Continue paid conversations with your agent.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
          {(["machine_sourcing", "white_label"] as const).map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setRouteType(rt)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                routeType === rt
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200/60"
                  : "text-neutral-600 hover:bg-emerald-50 hover:text-emerald-700"
              }`}
            >
              {rt === "machine_sourcing" ? "Machine sourcing" : "White label"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {status === "loading" ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {status === "idle" && paidOnly.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-sm">
            <p>No paid conversations yet.</p>
          </div>
        ) : null}

        {paidOnly.map((item) => (
          <Link
            key={item.id}
            href={`/conversations/${item.id}`}
            className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  {item.title}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                  Conversation #{item.id}
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  {item.last_message_text || "No messages yet."}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {shortDate.format(new Date(item.last_message_at || item.updated_at || item.created_at))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
