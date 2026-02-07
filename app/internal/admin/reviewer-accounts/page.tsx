"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewerAccount = {
  id: number;
  app_target: "mobile" | "agent";
  auth_channel: "email" | "phone";
  email: string | null;
  phone: string | null;
  fixed_otp: string | null;
  bypass_enabled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type EditState = {
  fixed_otp: string;
  notes: string;
  bypass_enabled: boolean;
};

export default function ReviewerAccountsPage() {
  const [items, setItems] = useState<ReviewerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [appTarget, setAppTarget] = useState<"mobile" | "agent">("mobile");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [formChannel, setFormChannel] = useState<"email" | "phone">("email");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formOtp, setFormOtp] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("app", appTarget);
      if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());

      const res = await fetch(`/api/internal/admin/reviewer-accounts?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load reviewer accounts");
      }
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load reviewer accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appTarget, debouncedSearch]);

  const filtered = useMemo(() => {
    return items;
  }, [items]);

  async function createReviewer() {
    setErr(null);
    const payload = {
      app_target: appTarget,
      auth_channel: appTarget === "mobile" ? "email" : formChannel,
      email: formEmail.trim(),
      phone: formPhone.trim(),
      fixed_otp: formOtp.trim(),
      notes: formNotes.trim(),
      bypass_enabled: formEnabled,
    };

    try {
      const res = await fetch("/api/internal/admin/reviewer-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create reviewer account");
      }

      setFormEmail("");
      setFormPhone("");
      setFormOtp("");
      setFormNotes("");
      setFormEnabled(true);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create reviewer account");
    }
  }

  function beginEdit(item: ReviewerAccount) {
    setEdits((prev) => ({
      ...prev,
      [item.id]: {
        fixed_otp: String(item.fixed_otp || ""),
        notes: String(item.notes || ""),
        bypass_enabled: item.bypass_enabled === 1,
      },
    }));
  }

  function cancelEdit(id: number) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(id: number) {
    const edit = edits[id];
    if (!edit) return;
    setSavingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/reviewer-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixed_otp: edit.fixed_otp.trim(),
          notes: edit.notes,
          bypass_enabled: edit.bypass_enabled,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update reviewer account");
      }
      cancelEdit(id);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update reviewer account");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleEnabled(item: ReviewerAccount) {
    setSavingId(item.id);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/reviewer-accounts/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bypass_enabled: !(item.bypass_enabled === 1) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update reviewer account");
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update reviewer account");
    } finally {
      setSavingId(null);
    }
  }

  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const btnSecondary =
    "inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-600";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Reviewer Access</h2>
            <p className="text-sm text-neutral-400">
              Configure fixed OTPs for Google/Apple review accounts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAppTarget("mobile")}
              className={`${btnSecondary} ${appTarget === "mobile" ? "border-neutral-500" : ""}`}
            >
              Mobile App
            </button>
            <button
              onClick={() => setAppTarget("agent")}
              className={`${btnSecondary} ${appTarget === "agent" ? "border-neutral-500" : ""}`}
            >
              Agent App
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {appTarget === "agent" ? (
              <select
                value={formChannel}
                onChange={(e) => setFormChannel(e.target.value as "email" | "phone")}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 sm:w-40"
              >
                <option value="email">Email OTP</option>
                <option value="phone">Phone OTP</option>
              </select>
            ) : (
              <div className="text-xs text-neutral-400">Email OTP only</div>
            )}

            <input
              value={formChannel === "phone" && appTarget === "agent" ? formPhone : formEmail}
              onChange={(e) => {
                const v = e.target.value;
                if (formChannel === "phone" && appTarget === "agent") setFormPhone(v);
                else setFormEmail(v);
              }}
              placeholder={formChannel === "phone" && appTarget === "agent" ? "+234..." : "reviewer@domain.com"}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />

            <input
              value={formOtp}
              onChange={(e) => setFormOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="Fixed OTP (6 digits)"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 sm:w-48"
            />

            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />

            <label className="flex items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
              />
              Enabled
            </label>

            <button onClick={createReviewer} className={btn}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-neutral-400">Existing reviewer accounts</div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, phone, notes"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 sm:w-80"
            />
            <button onClick={load} className={btnSecondary}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-neutral-400">Loading...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}

        {!loading ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Account</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">OTP</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Notes</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Status</th>
                  <th className="px-3 py-2 text-left border-b border-neutral-800">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-neutral-950">
                {filtered.map((item) => {
                  const edit = edits[item.id];
                  return (
                    <tr key={item.id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-neutral-100">
                          {item.auth_channel === "phone" ? item.phone : item.email}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {item.app_target} • {item.auth_channel}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {edit ? (
                          <input
                            value={edit.fixed_otp}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  fixed_otp: e.target.value.replace(/[^\d]/g, "").slice(0, 6),
                                },
                              }))
                            }
                            className="w-28 rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
                          />
                        ) : (
                          <span className="font-mono text-neutral-200">{item.fixed_otp || "—"}</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {edit ? (
                          <input
                            value={edit.notes}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  notes: e.target.value,
                                },
                              }))
                            }
                            className="w-56 rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
                          />
                        ) : (
                          <span className="text-neutral-200">{item.notes || "—"}</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <span className={item.bypass_enabled ? "text-emerald-300" : "text-neutral-400"}>
                          {item.bypass_enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        {edit ? (
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-neutral-300">
                              <input
                                type="checkbox"
                                checked={edit.bypass_enabled}
                                onChange={(e) =>
                                  setEdits((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      bypass_enabled: e.target.checked,
                                    },
                                  }))
                                }
                              />
                              Enabled
                            </label>
                            <button
                              onClick={() => saveEdit(item.id)}
                              className={btnSecondary}
                              disabled={savingId === item.id}
                            >
                              Save
                            </button>
                            <button onClick={() => cancelEdit(item.id)} className={btnSecondary}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => beginEdit(item)}
                              className={btnSecondary}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleEnabled(item)}
                              className={btnSecondary}
                              disabled={savingId === item.id}
                            >
                              {item.bypass_enabled ? "Disable" : "Enable"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr className="border-t border-neutral-800">
                    <td colSpan={5} className="px-3 py-4 text-sm text-neutral-400">
                      No reviewer accounts yet.
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
