"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../_components/SearchableSelect";

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
type StickyTarget = "user" | "agent" | "both";

type SettingsSnapshot = {
  id: number;
  commitment_due_ngn: number;
  agent_percent: number;
  agent_commitment_percent: number;
  markup_percent: number;
  points_value_ngn?: number;
  points_config_json?: any;
  exchange_rate_usd: number;
  exchange_rate_rmb: number;
  payout_summary_email?: string | null;
  agent_otp_mode?: "phone" | "email" | null;
  sticky_notice_enabled?: number;
  sticky_notice_title?: string | null;
  sticky_notice_body?: string | null;
  sticky_notice_target?: StickyTarget | null;
  sticky_notice_version?: number;
};

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
  const [panel, setPanel] = useState<"sticky" | "notification">("sticky");

  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [stickyEnabled, setStickyEnabled] = useState(false);
  const [stickyTitle, setStickyTitle] = useState("");
  const [stickyBody, setStickyBody] = useState("");
  const [stickyTarget, setStickyTarget] = useState<StickyTarget>("both");
  const [stickySendNotifications, setStickySendNotifications] = useState(true);
  const [stickyVersion, setStickyVersion] = useState(0);
  const [stickyErr, setStickyErr] = useState<string | null>(null);
  const [stickyOk, setStickyOk] = useState<string | null>(null);
  const [stickySaving, setStickySaving] = useState(false);

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

  useEffect(() => {
    const allowed = !!(me && "ok" in me && me.ok && me.user.role === "admin");
    if (!allowed) return;
    (async () => {
      try {
        const res = await fetch("/api/internal/settings", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const item = json.item as SettingsSnapshot;
        setSettingsSnapshot(item);
        setStickyEnabled(Boolean(item?.sticky_notice_enabled));
        setStickyTitle(String(item?.sticky_notice_title || ""));
        setStickyBody(String(item?.sticky_notice_body || ""));
        setStickyTarget(
          item?.sticky_notice_target === "user" || item?.sticky_notice_target === "agent"
            ? item.sticky_notice_target
            : "both"
        );
        setStickyVersion(Number(item?.sticky_notice_version || 0));
      } catch {
        // ignore
      }
    })();
  }, [me]);

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

  async function saveSticky(publish: boolean) {
    setStickyErr(null);
    setStickyOk(null);
    if (!settingsSnapshot) {
      setStickyErr("Settings not loaded yet.");
      return;
    }
    if (publish && (!stickyTitle.trim() || !stickyBody.trim())) {
      setStickyErr("Sticky notice title and message are required to publish.");
      return;
    }

    setStickySaving(true);
    try {
      const payload = {
        commitment_due_ngn: Number(settingsSnapshot.commitment_due_ngn || 0),
        agent_percent: Number(settingsSnapshot.agent_percent || 0),
        agent_commitment_percent: Number(settingsSnapshot.agent_commitment_percent || 0),
        markup_percent: Number(settingsSnapshot.markup_percent || 0),
        points_value_ngn: Number(settingsSnapshot.points_value_ngn || 0),
        points_config_json: settingsSnapshot.points_config_json ?? null,
        exchange_rate_usd: Number(settingsSnapshot.exchange_rate_usd || 0),
        exchange_rate_rmb: Number(settingsSnapshot.exchange_rate_rmb || 0),
        payout_summary_email: String(settingsSnapshot.payout_summary_email || "").trim(),
        agent_otp_mode: settingsSnapshot.agent_otp_mode === "email" ? "email" : "phone",
        sticky_notice_enabled: publish ? true : stickyEnabled,
        sticky_notice_title: stickyTitle.trim(),
        sticky_notice_body: stickyBody.trim(),
        sticky_notice_target: stickyTarget,
        publish_sticky_notice: publish,
      };

      const res = await fetch("/api/internal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setStickyErr(json?.error || "Failed to save sticky notice.");
        return;
      }

      const item = json.item as SettingsSnapshot;
      setSettingsSnapshot(item);
      setStickyEnabled(Boolean(item?.sticky_notice_enabled));
      setStickyTitle(String(item?.sticky_notice_title || ""));
      setStickyBody(String(item?.sticky_notice_body || ""));
      setStickyTarget(
        item?.sticky_notice_target === "user" || item?.sticky_notice_target === "agent"
          ? item.sticky_notice_target
          : "both"
      );
      setStickyVersion(Number(item?.sticky_notice_version || 0));

      if (publish && stickySendNotifications) {
        const send = async (t: Target) => {
          const notifRes = await fetch("/api/internal/notifications/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target: t,
              audience: "all",
              title: stickyTitle.trim(),
              body: stickyBody.trim(),
            }),
          });
          const notifJson = await notifRes.json().catch(() => ({}));
          if (!notifRes.ok || !notifJson?.ok) {
            throw new Error(notifJson?.error || "Failed to send notifications.");
          }
        };

        if (stickyTarget === "both") {
          await send("user");
          await send("agent");
        } else {
          await send(stickyTarget);
        }
      }

      setStickyOk(publish ? "Sticky notice published." : "Sticky notice saved.");
    } catch (e: any) {
      setStickyErr(e?.message || "Failed to save sticky notice.");
    } finally {
      setStickySaving(false);
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
          Publish sticky notices or send one-time announcements to agents or app users.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPanel("sticky")}
          className={`rounded-xl border px-4 py-2 text-xs font-semibold ${
            panel === "sticky"
              ? "border-white bg-white text-neutral-950"
              : "border-neutral-800 bg-neutral-900 text-neutral-300"
          }`}
        >
          Sticky notice
        </button>
        <button
          type="button"
          onClick={() => setPanel("notification")}
          className={`rounded-xl border px-4 py-2 text-xs font-semibold ${
            panel === "notification"
              ? "border-white bg-white text-neutral-950"
              : "border-neutral-800 bg-neutral-900 text-neutral-300"
          }`}
        >
          One-time notification
        </button>
      </div>

      {panel === "sticky" ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Sticky notice</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Shows once per user/agent until dismissed. Publish also sends normal notifications.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => saveSticky(false)}
                disabled={stickySaving}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-xs font-semibold text-neutral-100 hover:border-neutral-500 disabled:opacity-60"
              >
                {stickySaving ? "Saving..." : "Save notice"}
              </button>
              <button
                type="button"
                onClick={() => saveSticky(true)}
                disabled={stickySaving}
                className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-60"
              >
                {stickySaving ? "Publishing..." : "Publish notice"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={stickyEnabled}
                onChange={(e) => setStickyEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
              />
              Enabled
            </label>

            <label className="text-sm text-neutral-300">
              Target
              <SearchableSelect
                className="mt-2"
                value={stickyTarget}
                options={[
                  { value: "both", label: "Users + Agents" },
                  { value: "user", label: "Users only" },
                  { value: "agent", label: "Agents only" },
                ]}
                onChange={(next) =>
                  setStickyTarget(next === "user" || next === "agent" ? next : "both")
                }
              />
            </label>

            <div className="text-xs text-neutral-400 md:text-right">
              Current notice version: <span className="text-neutral-200">{stickyVersion}</span>
            </div>

            <label className="text-sm text-neutral-300 md:col-span-3">
              Title
              <input
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={stickyTitle}
                onChange={(e) => setStickyTitle(e.target.value)}
                placeholder="China holiday notice"
              />
            </label>

            <label className="text-sm text-neutral-300 md:col-span-3">
              Message
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={stickyBody}
                onChange={(e) => setStickyBody(e.target.value)}
                placeholder="China is currently on holiday. Response times may be slower through Feb 18."
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-200 md:col-span-3">
              <input
                type="checkbox"
                checked={stickySendNotifications}
                onChange={(e) => setStickySendNotifications(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
              />
              Send as normal notification on publish
            </label>
          </div>

          {stickyErr ? <div className="mt-4 text-sm text-red-300">{stickyErr}</div> : null}
          {stickyOk ? <div className="mt-4 text-sm text-emerald-300">{stickyOk}</div> : null}
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm text-neutral-300">
              Target
              <SearchableSelect
                className="mt-2"
                value={target}
                options={[
                  { value: "user", label: "Users" },
                  { value: "agent", label: "Agents" },
                ]}
                onChange={(next) => setTarget(next as Target)}
              />
            </label>

            <label className="text-sm text-neutral-300">
              Audience
              <SearchableSelect
                className="mt-2"
                value={audience}
                options={[
                  { value: "all", label: "Everyone" },
                  { value: "single", label: "Single recipient" },
                ]}
                onChange={(next) => setAudience(next as Audience)}
              />
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
      )}
    </div>
  );
}
