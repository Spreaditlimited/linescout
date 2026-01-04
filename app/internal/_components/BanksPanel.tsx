"use client";

import { useEffect, useMemo, useState } from "react";

type Bank = {
  id: number;
  name: string;
  is_active?: 0 | 1; // if your API returns it
};

export default function BanksPanel() {
  const [items, setItems] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = useMemo(() => name.trim().length >= 2, [name]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/linescout-banks", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load banks");
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load banks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBank() {
    if (!canCreate) return;
    setCreating(true);
    setMsg(null);
    setErr(null);

    try {
      const res = await fetch("/api/linescout-banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to create bank");

      setName("");
      setMsg("Bank created.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create bank");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(b: Bank) {
    // If your API doesn’t return is_active, remove this button later.
    const current = Number(b.is_active ?? 1);
    const next = current ? 0 : 1;

    setBusyId(b.id);
    setMsg(null);
    setErr(null);

    try {
      const res = await fetch("/api/linescout-banks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          id: b.id,
          is_active: next,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update bank");

      setMsg("Updated.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update bank");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Banks</h3>
          <p className="text-xs text-neutral-400">
            Used for recording manual bank payments during handoff creation.
          </p>
        </div>

        <div className="w-full sm:max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="text-sm font-semibold text-neutral-100">Add bank</div>

          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              placeholder="e.g. GTBank"
            />
            <button
              onClick={createBank}
              disabled={!canCreate || creating}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60"
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
            >
              Refresh
            </button>
          </div>

          {msg ? (
            <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {msg}
            </div>
          ) : null}

          {err ? (
            <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {loading ? <p className="text-sm text-neutral-400">Loading...</p> : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/70 text-neutral-300">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {items.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 text-neutral-100">{b.name}</td>
                    <td className="px-3 py-2 text-neutral-200">
                      {typeof b.is_active === "number" ? (b.is_active ? "Yes" : "No") : "Yes"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof b.is_active === "number" ? (
                        <button
                          disabled={busyId === b.id}
                          onClick={() => toggleActive(b)}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700 disabled:opacity-60"
                        >
                          {busyId === b.id ? "Saving..." : b.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-500">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}