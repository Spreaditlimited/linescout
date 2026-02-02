"use client";

import { useEffect, useMemo, useState } from "react";

type MeResponse =
  | {
      ok: true;
      user: {
        username: string;
        role: "admin" | "agent";
        permissions: {
          can_view_leads: boolean;
          can_view_handoffs: boolean;
          can_view_analytics: boolean;
        };
      };
    }
  | { ok: false; error: string };

type Target = "agent" | "user";
type Audience = "single" | "all";

export default function InternalNotificationsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [target, setTarget] = useState<Target>("user");
  const [audience, setAudience] = useState<Audience>("all");
  const [recipientId, setRecipientId] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: number; email?: string | null; username?: string | null; first_name?: string; last_name?: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dataJson, setDataJson] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/internal/auth/me", { cache: "no-store" });
        const json: MeResponse = await res.json().catch(() => ({ ok: false, error: "Failed" }));
        setMe(json);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canAccess = useMemo(() => {
    return !!(me && "ok" in me && me.ok && me.user.role === "admin");
  }, [me]);

  useEffect(() => {
    if (audience !== "single") {
      setSearch("");
      setSearchResults([]);
      setRecipientId("");
      setRecipientLabel("");
      return;
    }

    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/internal/notifications/recipients?target=${target}&q=${encodeURIComponent(q)}&limit=15`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          setSearchResults([]);
          return;
        }
        setSearchResults(Array.isArray(json.items) ? json.items : []);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [search, target, audience]);

  useEffect(() => {
    setRecipientId("");
    setRecipientLabel("");
    setSearchResults([]);
  }, [target, audience]);

  function pickRecipient(r: { id: number; email?: string | null; username?: string | null; first_name?: string; last_name?: string }) {
    const name = `${r.first_name || ""} ${r.last_name || ""}`.trim();
    const handle = r.username ? `@${r.username}` : "";
    const email = r.email || "";
    const label = [name, handle, email].filter(Boolean).join(" • ");
    setRecipientId(String(r.id));
    setRecipientLabel(label || `ID ${r.id}`);
    setSearchResults([]);
  }

  async function submit() {
    setErr(null);
    setOkMsg(null);

    if (!title.trim()) return setErr("Title is required.");
    if (!body.trim()) return setErr("Message is required.");
    if (audience === "single" && !recipientId.trim()) return setErr("Recipient ID is required.");

    let parsedData: any = null;
    if (dataJson.trim()) {
      try {
        parsedData = JSON.parse(dataJson);
      } catch {
        return setErr("Data must be valid JSON.");
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/internal/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          audience,
          recipient_id: audience === "single" ? Number(recipientId) : undefined,
          title: title.trim(),
          body: body.trim(),
          data: parsedData,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || `Failed (${res.status})`);
        return;
      }

      setOkMsg(`Sent. Notifications: ${json?.inserted ?? 0}. Devices: ${json?.sent ?? 0}.`);
      setBody("");
      setTitle("");
      setDataJson("");
      if (audience === "single") {
        setRecipientId("");
        setRecipientLabel("");
        setSearch("");
        setSearchResults([]);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-300">Loading…</div>;
  }

  if (!canAccess) {
    return <div className="p-8 text-sm text-red-300">Admin access required.</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Send announcements to agents or app users. Choose a single recipient or broadcast to all.
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm text-neutral-300">
            Target
            <select
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
            >
              <option value="user">Users</option>
              <option value="agent">Agents</option>
            </select>
          </label>

          <label className="text-sm text-neutral-300">
            Audience
            <select
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              <option value="all">Everyone</option>
              <option value="single">Single recipient</option>
            </select>
          </label>

          {audience === "single" ? (
            <label className="text-sm text-neutral-300">
              Recipient
              <input
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  target === "agent"
                    ? "Search agent by name, username, or email"
                    : "Search user by name or email"
                }
              />
              {searching ? (
                <div className="mt-2 text-xs text-neutral-400">Searching…</div>
              ) : null}
              {searchResults.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950">
                  {searchResults.map((r) => {
                    const name = `${r.first_name || ""} ${r.last_name || ""}`.trim();
                    const handle = r.username ? `@${r.username}` : "";
                    const email = r.email || "";
                    const label = [name, handle, email].filter(Boolean).join(" • ");
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickRecipient(r)}
                        className="block w-full border-b border-neutral-900 px-3 py-2 text-left text-sm text-white hover:bg-neutral-900"
                      >
                        {label || `ID ${r.id}`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {recipientId ? (
                <div className="mt-2 text-xs text-emerald-300">
                  Selected: {recipientLabel || `ID ${recipientId}`}
                </div>
              ) : null}
            </label>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <label className="text-sm text-neutral-300">
            Title
            <input
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New shipping discount this week"
            />
          </label>

          <label className="text-sm text-neutral-300">
            Message
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the announcement here..."
            />
          </label>

          <label className="text-sm text-neutral-300">
            Data (optional JSON)
            <textarea
              className="mt-2 min-h-[80px] w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white/80"
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              placeholder='{"deeplink":"/paid-project?id=21"}'
            />
          </label>
        </div>

        {err ? <div className="mt-4 text-sm text-red-300">{err}</div> : null}
        {okMsg ? <div className="mt-4 text-sm text-emerald-300">{okMsg}</div> : null}

        <div className="mt-6">
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Sending…" : "Send notification"}
          </button>
        </div>
      </div>
    </div>
  );
}
