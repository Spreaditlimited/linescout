"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: number;
  name: string;
  is_active: 0 | 1;
};

type Banner = { type: "ok" | "err"; msg: string } | null;

export default function ShippingCompaniesPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  const activeCount = useMemo(() => items.filter((x) => x.is_active).length, [items]);

  async function load() {
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/linescout-shipping-companies?all=1", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load shipping companies");
      setItems(data.items || []);
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to load shipping companies" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCompany() {
    const n = name.trim();
    if (!n) {
      setBanner({ type: "err", msg: "Enter a shipping company name." });
      return;
    }

    setCreating(true);
    setBanner(null);
    try {
      const res = await fetch("/api/linescout-shipping-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to create shipping company");

      setName("");
      setBanner({ type: "ok", msg: `Added "${n}".` });
      await load();
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to create shipping company" });
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(item: Item) {
    setBusyId(item.id);
    setBanner(null);
    try {
      const next = item.is_active ? 0 : 1;

      const res = await fetch("/api/linescout-shipping-companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_active", id: item.id, is_active: next }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to update shipping company");

      await load();
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to update shipping company" });
    } finally {
      setBusyId(null);
    }
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors border";
  const btnPrimary = `${btnBase} bg-white text-neutral-950 border-white hover:bg-neutral-200`;
  const btnSecondary = `${btnBase} border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700`;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Shipping Companies</h3>
          <p className="text-xs text-neutral-400">
            Manage the list used when a project is marked as shipped.
          </p>
        </div>

        <div className="text-xs text-neutral-400">
          Active: <span className="text-neutral-200 font-semibold">{activeCount}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-sm font-semibold text-neutral-100">Add shipping company</div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sky Cargo"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createCompany}
              disabled={creating}
              className={`${btnPrimary} ${creating ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {creating ? "Adding..." : "Add"}
            </button>

            <button type="button" onClick={load} className={btnSecondary}>
              Refresh
            </button>
          </div>
        </div>

        {banner ? (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
              banner.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {banner.msg}
          </div>
        ) : null}
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
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>

              <tbody className="bg-neutral-950">
                {items.map((it) => {
                  const disabled = busyId === it.id;
                  return (
                    <tr key={it.id} className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-neutral-100">{it.name}</td>
                      <td className="px-3 py-2 text-neutral-200">{it.is_active ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(it)}
                          disabled={disabled}
                          className={`${btnSecondary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {it.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-neutral-400" colSpan={3}>
                      No shipping companies yet.
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