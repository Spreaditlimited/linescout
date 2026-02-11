"use client";

import { useEffect, useState } from "react";
import SearchableSelect from "../_components/SearchableSelect";

type Row = {
  id: number;
  user_id: number;
  amount: number;
  status: string;
  rejection_reason?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  email?: string | null;
  display_name?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  bank_status?: string | null;
};

export default function UserPayoutsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(`/api/internal/admin/user-payouts?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setErr(json?.error || `Failed (${res.status})`);
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(id: number) {
    const res = await fetch("/api/internal/admin/user-payouts/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) load();
  }

  async function reject(id: number) {
    const reason = prompt("Reason for rejection?");
    if (reason === null) return;
    const res = await fetch("/api/internal/admin/user-payouts/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason }),
    });
    if (res.ok) load();
  }

  async function markPaid(id: number) {
    const res = await fetch("/api/internal/admin/user-payouts/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) load();
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Payouts</h1>
        <p className="mt-1 text-sm text-neutral-400">Approve, reject, and mark payouts paid.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/internal/admin/payouts"
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900"
          >
            Agents
          </a>
          <span className="rounded-xl border border-neutral-700 bg-white/10 px-3 py-2 text-xs font-semibold text-white">
            Users
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="w-72 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
          placeholder="Search email/name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SearchableSelect
          value={status}
          options={[
            { value: "", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "paid", label: "Paid" },
          ]}
          onChange={(next) => setStatus(next)}
          className="w-52"
        />
        <button onClick={load} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">
          Search
        </button>
      </div>

      {err ? <div className="mb-3 text-sm text-red-300">{err}</div> : null}

      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60">
        <div className="grid grid-cols-12 gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-semibold text-neutral-400">
          <div className="col-span-3">User</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Bank</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-neutral-300">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-400">No payout requests.</div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-3 px-4 py-4 text-sm text-neutral-200 border-b border-neutral-800/70">
              <div className="col-span-3">
                <div className="font-semibold text-white">{r.display_name || r.email || `User ${r.user_id}`}</div>
                <div className="text-xs text-neutral-400">ID: {r.user_id}</div>
              </div>
              <div className="col-span-2">NGN {Number(r.amount || 0).toLocaleString()}</div>
              <div className="col-span-2 capitalize">{r.status}</div>
              <div className="col-span-3 text-xs">
                <div>{r.bank_code || "—"}</div>
                <div className="text-neutral-400">{r.account_number || ""}</div>
              </div>
              <div className="col-span-2 flex flex-wrap gap-2">
                {r.status === "pending" ? (
                  <>
                    <button onClick={() => approve(r.id)} className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                      Approve
                    </button>
                    <button onClick={() => reject(r.id)} className="rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-200">
                      Reject
                    </button>
                  </>
                ) : null}
                {r.status === "approved" ? (
                  <button onClick={() => markPaid(r.id)} className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    Mark paid
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
