"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../_components/SearchableSelect";

type WalletRow = {
  wallet_id: number;
  owner_type: "user" | "agent";
  owner_id: number;
  currency: string;
  balance: string;
  updated_at: string;
  account_number?: string | null;
  account_name?: string | null;
  user_email?: string | null;
  user_display_name?: string | null;
  agent_username?: string | null;
  agent_first_name?: string | null;
  agent_last_name?: string | null;
  agent_email?: string | null;
};

export default function InternalWalletsPage() {
  const [items, setItems] = useState<WalletRow[]>([]);
  const [q, setQ] = useState("");
  const [ownerType, setOwnerType] = useState<"" | "user" | "agent">("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<{ owner_type: "user" | "agent"; owner_id: number } | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (ownerType) qs.set("owner_type", ownerType);
      const res = await fetch(`/api/internal/admin/wallets?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || `Failed (${res.status})`);
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatName(w: WalletRow) {
    if (w.owner_type === "user") {
      return w.user_display_name || w.user_email || `User ${w.owner_id}`;
    }
    const name = `${w.agent_first_name || ""} ${w.agent_last_name || ""}`.trim();
    return name || w.agent_username || w.agent_email || `Agent ${w.owner_id}`;
  }

  function openAdjust(w: WalletRow, type: "credit" | "debit") {
    setAdjustTarget({ owner_type: w.owner_type, owner_id: w.owner_id });
    setAdjustType(type);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustOpen(true);
  }

  async function submitAdjust() {
    setErr(null);
    setOk(null);
    if (!adjustTarget) return;
    const amount = Number(adjustAmount);
    if (!amount || amount <= 0) return setErr("Amount must be greater than 0");
    if (!adjustReason.trim()) return setErr("Reason is required");

    setAdjustSaving(true);
    try {
      const res = await fetch("/api/internal/admin/wallets/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: adjustTarget.owner_type,
          owner_id: adjustTarget.owner_id,
          type: adjustType,
          amount,
          reason: adjustReason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || `Failed (${res.status})`);
        return;
      }
      setOk("Wallet updated.");
      setAdjustOpen(false);
      await load();
    } finally {
      setAdjustSaving(false);
    }
  }

  const filtered = useMemo(() => items, [items]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Wallets</h1>
        <p className="mt-1 text-sm text-neutral-400">View balances and apply manual credits/debits.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="w-72 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
          placeholder="Search name, username, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SearchableSelect
          value={ownerType}
          options={[
            { value: "", label: "All" },
            { value: "user", label: "Users" },
            { value: "agent", label: "Agents" },
          ]}
          onChange={(next) => setOwnerType(next as any)}
          className="w-40"
        />
        <button
          onClick={load}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Search
        </button>
      </div>

      {err ? <div className="mb-3 text-sm text-red-300">{err}</div> : null}
      {ok ? <div className="mb-3 text-sm text-emerald-300">{ok}</div> : null}

      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60">
        <div className="grid grid-cols-12 gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-semibold text-neutral-400">
          <div className="col-span-3">Owner</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Balance</div>
          <div className="col-span-3">Virtual Account</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-neutral-300">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-400">No wallets found.</div>
        ) : (
          filtered.map((w) => (
            <div key={`${w.owner_type}-${w.owner_id}`} className="grid grid-cols-12 gap-3 px-4 py-4 text-sm text-neutral-200 border-b border-neutral-800/70">
              <div className="col-span-3">
                <div className="font-semibold text-white">{formatName(w)}</div>
                <div className="text-xs text-neutral-400">ID: {w.owner_id}</div>
              </div>
              <div className="col-span-2 capitalize">{w.owner_type}</div>
              <div className="col-span-2">NGN {Number(w.balance || 0).toLocaleString()}</div>
              <div className="col-span-3">
                <div className="text-xs text-neutral-300">{w.account_number || "—"}</div>
                <div className="text-[11px] text-neutral-500">{w.account_name || ""}</div>
              </div>
              <div className="col-span-2 flex flex-wrap gap-2">
                <button
                  onClick={() => openAdjust(w, "credit")}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200"
                >
                  Credit
                </button>
                <button
                  onClick={() => openAdjust(w, "debit")}
                  className="rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-200"
                >
                  Debit
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {adjustOpen && adjustTarget ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="text-sm font-semibold text-white">
              {adjustType === "credit" ? "Credit wallet" : "Debit wallet"}
            </div>
            <div className="mt-3 text-xs text-neutral-400">
              {adjustTarget.owner_type} • ID {adjustTarget.owner_id}
            </div>

            <input
              className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
              placeholder="Amount"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
            />
            <input
              className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
              placeholder="Reason (e.g. Refund adjustment)"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setAdjustOpen(false)}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={submitAdjust}
                disabled={adjustSaving}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {adjustSaving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
