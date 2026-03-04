"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Status = "pending" | "approved" | "rejected" | "paid" | "failed";

type Row = {
  id: number;
  affiliate_id: number;
  amount: number;
  currency: string;
  status: Status;
  requested_note: string | null;
  admin_note: string | null;
  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  paystack_transfer_code: string | null;
  paystack_reference: string | null;
  paypal_payout_id: string | null;
  email: string;
  name: string | null;
  referral_code: string;
  provider: string | null;
  provider_account: string | null;
  payout_status: string | null;
};

export default function AdminAffiliatePayoutsPage() {
  const pathname = usePathname();
  const [tab, setTab] = useState<Status>("pending");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(status: Status) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/affiliate-payouts?status=${status}&limit=50&cursor=0`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load payouts");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
  }, [tab]);

  async function approve(id: number) {
    setBusy(true);
    try {
      await fetch("/api/internal/admin/affiliate-payouts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: id }),
      });
      await load(tab);
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: number) {
    setBusy(true);
    try {
      await fetch("/api/internal/admin/affiliate-payouts/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: id, admin_note: "Rejected" }),
      });
      await load(tab);
    } finally {
      setBusy(false);
    }
  }

  async function pay(id: number) {
    setBusy(true);
    try {
      await fetch("/api/internal/admin/affiliate-payouts/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: id }),
      });
      await load(tab);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          { href: "/internal/admin/affiliates", label: "Affiliates" },
          { href: "/internal/admin/affiliate-commissions", label: "Commissions" },
          { href: "/internal/admin/affiliate-payouts", label: "Payouts" },
        ].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                active
                  ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "paid", "rejected", "failed"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              tab === s
                ? "border-neutral-600 bg-neutral-100 text-neutral-950"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 text-sm text-neutral-200">
          Loading…
        </div>
      ) : err ? (
        <div className="rounded-3xl border border-red-700/40 bg-red-900/20 p-6 text-sm text-red-200">
          {err}
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-200">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2">ID</th>
                  <th className="py-2">Affiliate</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Provider</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-800">
                    <td className="py-2">{item.id}</td>
                    <td className="py-2">
                      <div className="text-xs text-neutral-400">{item.email}</div>
                      <div className="text-sm text-neutral-100">{item.name || "—"}</div>
                    </td>
                    <td className="py-2">{item.currency} {Number(item.amount || 0).toFixed(2)}</td>
                    <td className="py-2">{item.status}</td>
                    <td className="py-2">{item.provider || "—"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        {item.status === "pending" && (
                          <button
                            disabled={busy}
                            onClick={() => approve(item.id)}
                            className="rounded-xl border border-neutral-700 bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-950"
                          >
                            Approve
                          </button>
                        )}
                        {item.status === "approved" && (
                          <button
                            disabled={busy}
                            onClick={() => pay(item.id)}
                            className="rounded-xl border border-emerald-700 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
                          >
                            Pay
                          </button>
                        )}
                        {item.status === "pending" && (
                          <button
                            disabled={busy}
                            onClick={() => reject(item.id)}
                            className="rounded-xl border border-red-700 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-sm text-neutral-500">
                      No payout requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
