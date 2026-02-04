"use client";

import { useEffect, useMemo, useState } from "react";

type MeResponse =
  | {
      ok: true;
      user: {
        role: "admin" | "agent";
      };
    }
  | { ok: false; error: string };

type SupportItem = {
  id: number;
  internal_user_id: number;
  subject: string | null;
  message: string;
  status: "pending" | "reviewed" | "resolved";
  admin_response_channel: "email" | "whatsapp" | "phone" | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  china_phone: string | null;
};

export default function AgentSupportPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<"pending" | "reviewed" | "resolved" | "all">("pending");
  const [items, setItems] = useState<SupportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/internal/auth/me", { cache: "no-store" });
      const json: MeResponse = await res.json().catch(() => ({ ok: false, error: "Failed" }));
      setMe(json);
    })();
  }, []);

  const canAccess = useMemo(() => !!(me && "ok" in me && me.ok && me.user.role === "admin"), [me]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/agent-support?status=${status}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || `Failed (${res.status})`));
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load support requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess, status]);

  async function save(item: SupportItem) {
    setSavingId(item.id);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/agent-support/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: item.status,
          admin_response_channel: item.admin_response_channel || "",
          admin_note: item.admin_note || "",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || `Failed (${res.status})`));
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update request");
    } finally {
      setSavingId(null);
    }
  }

  if (!canAccess) return <div className="p-8 text-sm text-red-300">Admin access required.</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Agent Support</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Agents can message admin for help. Set how you will respond: email, WhatsApp, or phone.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(["pending", "reviewed", "resolved", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              status === s
                ? "border-white bg-white text-neutral-950"
                : "border-neutral-800 bg-neutral-900 text-neutral-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {err ? <div className="mb-4 rounded-xl border border-red-700/60 bg-red-900/20 px-3 py-2 text-sm text-red-200">{err}</div> : null}
      {loading ? <div className="text-sm text-neutral-400">Loading…</div> : null}

      <div className="space-y-3">
        {items.map((item) => {
          const fullName = `${item.first_name || ""} ${item.last_name || ""}`.trim();
          return (
            <div key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">#{item.id} {item.subject || "Support request"}</div>
                <div className="text-xs text-neutral-400">{new Date(item.created_at).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {fullName || item.username} · {item.email || "No email"} · {item.china_phone || "No phone"}
              </div>
              <div className="mt-3 whitespace-pre-line text-sm text-neutral-200">{item.message}</div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-xs text-neutral-300">
                  Status
                  <select
                    className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    value={item.status}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) => (x.id === item.id ? { ...x, status: e.target.value as SupportItem["status"] } : x))
                      )
                    }
                  >
                    <option value="pending">pending</option>
                    <option value="reviewed">reviewed</option>
                    <option value="resolved">resolved</option>
                  </select>
                </label>
                <label className="text-xs text-neutral-300">
                  Response channel
                  <select
                    className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    value={item.admin_response_channel || ""}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === item.id ? { ...x, admin_response_channel: (e.target.value || null) as any } : x
                        )
                      )
                    }
                  >
                    <option value="">Not set</option>
                    <option value="email">email</option>
                    <option value="whatsapp">whatsapp</option>
                    <option value="phone">phone</option>
                  </select>
                </label>
                <label className="text-xs text-neutral-300 md:col-span-1">
                  Admin note
                  <input
                    className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    value={item.admin_note || ""}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, admin_note: e.target.value } : x)))
                    }
                    placeholder="Optional note"
                  />
                </label>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => save(item)}
                  disabled={savingId === item.id}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-100 hover:border-neutral-500 disabled:opacity-60"
                >
                  {savingId === item.id ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          );
        })}
        {!loading && !items.length ? <div className="text-sm text-neutral-500">No support requests.</div> : null}
      </div>
    </div>
  );
}
