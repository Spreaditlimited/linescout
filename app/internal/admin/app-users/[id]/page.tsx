"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SearchableSelect from "../../../_components/SearchableSelect";

type UserSummary = {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
  country_id?: number | null;
  country_name?: string | null;
  country_iso2?: string | null;
  display_currency_code?: string | null;

  last_seen_at: string | null;
  last_session_created_at: string | null;
  active_sessions: number;

  conversations_count: number;
  last_conversation_at: string | null;

  white_label_projects_count: number;
};

type SessionRow = {
  id: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
};

type ConversationRow = {
  id: number;
  created_at: string;
  updated_at: string;
};

type WLRow = {
  id: number;
  status: string;
  step: number;
  category: string | null;
  product_name: string | null;
  quantity_tier: string | null;
  branding_level: string | null;
  target_landed_cost_naira: number | null;
  sourcing_token: string | null;
  handoff_id: number | null;
  created_at: string;
  updated_at: string;
  country_id?: number | null;
  display_currency_code?: string | null;
};

type HandoffRow = {
  id: number;
  token: string;
  handoff_type: string;
  status: string;
  email: string | null;
  customer_name: string | null;
  whatsapp_number: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  country_id?: number | null;
  display_currency_code?: string | null;
};

type ApiResponse =
  | {
      ok: true;
      user: UserSummary;
      sessions: SessionRow[];
      conversations: ConversationRow[];
      white_label_projects: WLRow[];
      handoffs: HandoffRow[];
      countries: { id: number; name: string; iso2: string; default_currency_id?: number | null }[];
      currencies: { id: number; code: string; symbol?: string | null }[];
      country_currencies: { country_id: number; currency_id: number }[];
    }
  | { ok: false; error: string };

type Tab = "overview" | "sessions" | "handoffs" | "conversations" | "white_label";

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

export default function AdminAppUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params?.id || 0);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<Tab>("overview");
  const [countryId, setCountryId] = useState<number | "">("");
  const [displayCurrencyCode, setDisplayCurrencyCode] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/app-users/${userId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        throw new Error((json as any)?.error || "Failed to load user");
      }
      setData(json);
      const u = (json as any).user as UserSummary;
      setCountryId(typeof u?.country_id === "number" ? u.country_id : "");
      setDisplayCurrencyCode(String(u?.display_currency_code || ""));
    } catch (e: any) {
      setErr(e?.message || "Failed to load user");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const ok = useMemo(() => !!(data && "ok" in data && data.ok), [data]);
  const user = ok ? (data as any).user as UserSummary : null;
  const countries = ok
    ? (data as any).countries as { id: number; name: string; iso2: string; default_currency_id?: number | null }[]
    : [];
  const currencies = ok ? (data as any).currencies as { id: number; code: string; symbol?: string | null }[] : [];
  const countryCurrencies = ok ? (data as any).country_currencies as { country_id: number; currency_id: number }[] : [];

  const countryOptions = [{ value: "", label: "Select country" }].concat(
    (countries || []).map((c) => ({
      value: String(c.id),
      label: `${c.name} (${c.iso2})`,
    }))
  );
  function getCountryDefaultCurrency(nextCountryId: number | "") {
    if (!nextCountryId) return "";
    const country = (countries || []).find((c) => Number(c.id) === Number(nextCountryId));
    const defaultCurrencyId = country?.default_currency_id ? Number(country.default_currency_id) : null;
    if (!defaultCurrencyId) return "";
    const currency = (currencies || []).find((c) => Number(c.id) === defaultCurrencyId);
    return currency?.code ? String(currency.code) : "";
  }

  useEffect(() => {
    if (!countryId) return;
    if (displayCurrencyCode) return;
    const next = getCountryDefaultCurrency(countryId);
    if (next) setDisplayCurrencyCode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, countries, currencies]);

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors";
  const btnIdle = "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700";
  const btnActive = "border-neutral-600 bg-neutral-100 text-neutral-950";

  if (!userId) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <p className="text-sm text-neutral-300">Invalid user id.</p>
        <Link href="/internal/admin/app-users" className="mt-2 inline-block text-sm text-neutral-200 underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/internal/admin/app-users"
                className="text-sm text-neutral-300 underline hover:text-neutral-100"
              >
                App Users
              </Link>
              <span className="text-neutral-600">/</span>
              <span className="text-sm text-neutral-300">User #{userId}</span>
            </div>

            <h2 className="mt-2 text-lg font-semibold text-neutral-100">
              {user?.email || "Loading..."}
            </h2>

            {user?.display_name ? (
              <p className="text-sm text-neutral-400">{user.display_name}</p>
            ) : (
              <p className="text-sm text-neutral-500">No display name</p>
            )}
          </div>

          <button
            onClick={load}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Refresh
          </button>
        </div>

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}
      </div>

      {ok && user ? (
        <>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Country & currency</h3>
                <p className="mt-1 text-xs text-neutral-500">Controls display currency for this user.</p>
              </div>
              <button
                onClick={async () => {
                  setSaveErr(null);
                  setSaving(true);
                  try {
                    const res = await fetch(`/api/internal/admin/app-users/${userId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        country_id: countryId || null,
                      }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) {
                      throw new Error(json?.error || "Failed to save");
                    }
                    await load();
                  } catch (e: any) {
                    setSaveErr(e?.message || "Failed to save");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            {saveErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                {saveErr}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-neutral-400">Country</label>
                <SearchableSelect
                  value={countryId === "" ? "" : String(countryId)}
                  onChange={(value) => {
                    const next = value ? Number(value) : "";
                    setCountryId(next);
                    setDisplayCurrencyCode(getCountryDefaultCurrency(next));
                  }}
                  options={countryOptions}
                  placeholder="Select country"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-400">Display currency</label>
                <input
                  type="text"
                  value={displayCurrencyCode}
                  disabled
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["overview", "Overview"],
                ["handoffs", "Handoffs"],
                ["conversations", "Conversations"],
                ["white_label", "White label"],
                ["sessions", "Sessions"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`${btnBase} ${tab === k ? btnActive : btnIdle}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {tab === "overview" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Created</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">{fmt(user.created_at)}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Last seen</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">{fmt(user.last_seen_at)}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Active sessions</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">{user.active_sessions}</div>
                <div className="mt-1 text-xs text-neutral-500">Last session: {fmt(user.last_session_created_at)}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Conversations</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">{user.conversations_count}</div>
                <div className="mt-1 text-xs text-neutral-500">Last: {fmt(user.last_conversation_at)}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">White label projects</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">{user.white_label_projects_count}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-xs text-neutral-500">Quick links</div>
                <div className="mt-2 space-y-2 text-sm">
                  <button onClick={() => setTab("handoffs")} className="text-neutral-200 underline">View handoffs</button>
                  <div />
                  <button onClick={() => setTab("sessions")} className="text-neutral-200 underline">View sessions</button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Handoffs */}
          {tab === "handoffs" ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="text-sm font-semibold text-neutral-100">Handoffs</h3>
              <p className="mt-1 text-xs text-neutral-500">This is the source of truth for projects.</p>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">ID</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Token</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Type</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Status</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Claimed</th>
                        <th className="px-3 py-2 text-left border-b border-neutral-800">Actions</th>
                    </tr>
                    </thead>
                  <tbody className="bg-neutral-950">
                    {(data as any).handoffs.map((h: HandoffRow) => (
                      <tr key={h.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-neutral-200">{h.id}</td>
                        <td className="px-3 py-2 text-neutral-200 font-mono">{h.token}</td>
                        <td className="px-3 py-2 text-neutral-200">{h.handoff_type}</td>
                        <td className="px-3 py-2 text-neutral-200">{h.status}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(h.created_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">
                          {h.claimed_by ? `${h.claimed_by} • ${fmt(h.claimed_at)}` : "N/A"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                            href={`/internal/handoffs/${h.id}`}
                            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                        >
                            View
                        </Link>
                        </td>
                      </tr>
                    ))}

                    {(data as any).handoffs.length === 0 ? (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={6} className="px-3 py-3 text-neutral-400">No handoffs found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Conversations */}
          {tab === "conversations" ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="text-sm font-semibold text-neutral-100">Conversations</h3>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">ID</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {(data as any).conversations.map((c: ConversationRow) => (
                      <tr key={c.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-neutral-200">{c.id}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(c.created_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(c.updated_at)}</td>
                      </tr>
                    ))}

                    {(data as any).conversations.length === 0 ? (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={3} className="px-3 py-3 text-neutral-400">No conversations found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* White label */}
          {tab === "white_label" ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="text-sm font-semibold text-neutral-100">White label projects</h3>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">ID</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Status</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Product</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Handoff</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {(data as any).white_label_projects.map((p: WLRow) => (
                      <tr key={p.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-neutral-200">{p.id}</td>
                        <td className="px-3 py-2 text-neutral-200">{p.status}</td>
                        <td className="px-3 py-2 text-neutral-200">
                          {p.product_name || "N/A"}
                          <div className="text-[11px] text-neutral-500">
                            {p.category || "Other"} • step {p.step}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-neutral-200">{p.handoff_id ?? "N/A"}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(p.created_at)}</td>
                      </tr>
                    ))}

                    {(data as any).white_label_projects.length === 0 ? (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={5} className="px-3 py-3 text-neutral-400">No white label projects found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Sessions */}
          {tab === "sessions" ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="text-sm font-semibold text-neutral-100">Sessions</h3>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">ID</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Created</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Expires</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Revoked</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Last seen</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">IP</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {(data as any).sessions.map((s: SessionRow) => (
                      <tr key={s.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-neutral-200">{s.id}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(s.created_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(s.expires_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(s.revoked_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">{fmt(s.last_seen_at)}</td>
                        <td className="px-3 py-2 text-neutral-400">{s.ip_address || "N/A"}</td>
                      </tr>
                    ))}

                    {(data as any).sessions.length === 0 ? (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={6} className="px-3 py-3 text-neutral-400">No sessions found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                Tip: you can expand this later to include user agent and revoke actions if needed.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
