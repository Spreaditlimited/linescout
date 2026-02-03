"use client";

import { useEffect, useState } from "react";

type Provider = "paystack" | "providus";
type OwnerType = "user" | "agent";

type PaymentSettings = {
  provider_default: Provider;
  allow_overrides: boolean;
  updated_at?: string | null;
};

type Recipient = {
  id: number;
  username: string | null;
  email: string | null;
  first_name?: string;
  last_name?: string;
  display_name?: string | null;
};

type OverrideRow = {
  id: number;
  owner_type: OwnerType;
  owner_id: number;
  provider: Provider;
  created_at?: string | null;
  updated_at?: string | null;
  username?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
};

export default function PaymentsPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ownerType, setOwnerType] = useState<OwnerType>("user");
  const [provider, setProvider] = useState<Provider>("paystack");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientErr, setRecipientErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Recipient | null>(null);

  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [overridesErr, setOverridesErr] = useState<string | null>(null);
  const [overridesLoading, setOverridesLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  async function loadSettings() {
    setSettingsErr(null);
    try {
      const res = await fetch("/api/internal/payment-settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load settings");
      setSettings(data.settings);
    } catch (e: any) {
      setSettingsErr(e?.message || "Failed to load settings");
    }
  }

  async function loadOverrides() {
    setOverridesLoading(true);
    setOverridesErr(null);
    try {
      const res = await fetch(
        `/api/internal/payment-overrides?owner_type=${ownerType}&q=${encodeURIComponent(debouncedQuery)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load overrides");
      setOverrides(data.items || []);
    } catch (e: any) {
      setOverridesErr(e?.message || "Failed to load overrides");
    } finally {
      setOverridesLoading(false);
    }
  }

  async function loadRecipients() {
    if (!debouncedQuery.trim()) {
      setRecipients([]);
      return;
    }

    setRecipientErr(null);
    try {
      const res = await fetch(
        `/api/internal/notifications/recipients?target=${ownerType}&q=${encodeURIComponent(debouncedQuery)}&limit=10`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load recipients");
      setRecipients(data.items || []);
    } catch (e: any) {
      setRecipientErr(e?.message || "Failed to load recipients");
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadOverrides();
    loadRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, debouncedQuery]);

  async function saveSettings(next: PaymentSettings) {
    setSaving(true);
    setSettingsErr(null);
    try {
      const res = await fetch("/api/internal/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_default: next.provider_default,
          allow_overrides: next.allow_overrides,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update settings");
      await loadSettings();
    } catch (e: any) {
      setSettingsErr(e?.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  async function applyOverride() {
    if (!selected) {
      setRecipientErr("Select a recipient first.");
      return;
    }
    try {
      const res = await fetch("/api/internal/payment-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: selected.id,
          provider,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to set override");
      setSelected(null);
      setQuery("");
      setRecipients([]);
      await loadOverrides();
    } catch (e: any) {
      setRecipientErr(e?.message || "Failed to set override");
    }
  }

  async function removeOverride(row: OverrideRow) {
    try {
      const res = await fetch("/api/internal/payment-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_type: row.owner_type, owner_id: row.owner_id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to remove override");
      await loadOverrides();
    } catch (e: any) {
      setOverridesErr(e?.message || "Failed to remove override");
    }
  }

  function labelRecipient(r: Recipient) {
    if (ownerType === "agent") {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      return `${name || r.username || "Agent"}${r.email ? ` • ${r.email}` : ""}`;
    }
    return `${r.email || "User"}${r.display_name ? ` • ${r.display_name}` : ""}`;
  }

  const allowOverrides = settings?.allow_overrides ?? true;

  const buttonBase =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const buttonDisabled = "opacity-60 cursor-not-allowed";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-neutral-100">Payments</h2>
          <p className="text-sm text-neutral-400">
            Switch the primary funding provider and control who can override it.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Global default</div>
            <p className="mt-1 text-xs text-neutral-500">
              This provider is used when no override is set.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(["paystack", "providus"] as Provider[]).map((p) => {
                const active = settings?.provider_default === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      saveSettings({
                        provider_default: p,
                        allow_overrides: allowOverrides,
                      })
                    }
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      active
                        ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                        : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                    }`}
                  >
                    {p === "paystack" ? "Paystack" : "Providus"}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  saveSettings({
                    provider_default: settings?.provider_default || "paystack",
                    allow_overrides: !allowOverrides,
                  })
                }
                className={`rounded-xl border px-4 py-2 text-sm ${
                  allowOverrides
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                }`}
              >
                {allowOverrides ? "Overrides Enabled" : "Overrides Disabled"}
              </button>
              <span className="text-xs text-neutral-500">
                {allowOverrides ? "Per-user/agent overrides are allowed." : "Overrides are ignored."}
              </span>
            </div>

            {settingsErr ? <p className="mt-3 text-sm text-red-300">{settingsErr}</p> : null}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="text-sm font-semibold text-neutral-100">Provider override</div>
            <p className="mt-1 text-xs text-neutral-500">
              Set a provider for a specific user or agent.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setOwnerType("user");
                  setSelected(null);
                }}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  ownerType === "user"
                    ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                    : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                }`}
              >
                User
              </button>
              <button
                type="button"
                onClick={() => {
                  setOwnerType("agent");
                  setSelected(null);
                }}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  ownerType === "agent"
                    ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                    : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                }`}
              >
                Agent
              </button>
            </div>

            <div className="mt-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ownerType === "agent" ? "Search agent by name, email, username..." : "Search user by email or name..."}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              />

              {recipients.length ? (
                <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-950">
                  {recipients.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelected(r)}
                      className={`block w-full px-3 py-2 text-left text-sm ${
                        selected?.id === r.id
                          ? "bg-neutral-100 text-neutral-950"
                          : "text-neutral-200 hover:bg-neutral-900/60"
                      }`}
                    >
                      {labelRecipient(r)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["paystack", "providus"] as Provider[]).map((p) => {
                const active = provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      active
                        ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                        : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700"
                    }`}
                  >
                    {p === "paystack" ? "Paystack" : "Providus"}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={applyOverride}
                className={`${buttonBase} ${!selected ? buttonDisabled : ""}`}
                disabled={!selected}
              >
                Apply override
              </button>
            </div>

            {recipientErr ? <p className="mt-3 text-sm text-red-300">{recipientErr}</p> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">Current overrides</h3>
            <p className="text-xs text-neutral-500">Overrides are grouped by the current filter.</p>
          </div>
          <button onClick={loadOverrides} className={buttonBase}>
            Refresh
          </button>
        </div>

        {overridesLoading ? <p className="mt-3 text-sm text-neutral-400">Loading overrides...</p> : null}
        {overridesErr ? <p className="mt-3 text-sm text-red-300">{overridesErr}</p> : null}

        {!overridesLoading && !overridesErr ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Owner</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Provider</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Updated</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Action</th>
                </tr>
              </thead>
              <tbody className="bg-neutral-950">
                {overrides.map((row) => {
                  const label =
                    row.owner_type === "agent"
                      ? `${[row.first_name, row.last_name].filter(Boolean).join(" ") || row.username || "Agent"}${
                          row.email ? ` • ${row.email}` : ""
                        }`
                      : `${row.email || "User"}${row.display_name ? ` • ${row.display_name}` : ""}`;

                  return (
                    <tr key={`${row.owner_type}-${row.owner_id}`} className="border-t border-neutral-800">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-neutral-100">{label}</div>
                        <div className="text-xs text-neutral-500">
                          {row.owner_type} • ID {row.owner_id}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-neutral-200">
                        {row.provider === "paystack" ? "Paystack" : "Providus"}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-400">
                        {row.updated_at ? new Date(row.updated_at).toLocaleString() : "N/A"}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => removeOverride(row)}
                          className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!overrides.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-sm text-neutral-500">
                      No overrides found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
