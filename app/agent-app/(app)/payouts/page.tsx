"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AgentAppShell from "../_components/AgentAppShell";

const MIN_PAYOUT_NGN = 100;

type PayoutItem = {
  id: number;
  amount_kobo: number;
  currency: string;
  status: string;
  requested_note: string | null;
  admin_note: string | null;
  requested_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

type Earnings = {
  gross_earned_ngn: number;
  paid_out_ngn: number;
  locked_ngn: number;
  available_ngn: number;
};

type Commission = {
  agent_percent: number;
  agent_commitment_percent: number;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function formatNaira(value: number, digits = 2) {
  return `NGN ${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatKobo(kobo: number) {
  return formatNaira(Number(kobo || 0) / 100, 2);
}

function statusChip(statusRaw: string) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "paid") return { bg: "bg-emerald-100", text: "text-emerald-700", label: "PAID" };
  if (status === "approved") return { bg: "bg-blue-100", text: "text-blue-600", label: "APPROVED" };
  if (status === "rejected") return { bg: "bg-rose-100", text: "text-rose-600", label: "REJECTED" };
  return { bg: "bg-neutral-100", text: "text-neutral-600", label: "PENDING" };
}

export default function PayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commission, setCommission] = useState<Commission | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [requesting, setRequesting] = useState(false);

  const availableEarnings = useMemo(() => Number(earnings?.available_ngn || 0), [earnings]);
  const amountNumber = useMemo(() => Number(clean(payoutAmount || "0")), [payoutAmount]);

  const loadCommission = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/agents/commission", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setCommission(json?.commission || null);
      setEarnings(json?.earnings || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load payout data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const res = await fetch("/api/internal/agents/payout-requests/mine?limit=20", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) setPayouts(Array.isArray(json.items) ? json.items : []);
      else setPayouts([]);
    } finally {
      setPayoutLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadCommission(), loadPayouts()]);
  }, [loadCommission, loadPayouts]);

  useEffect(() => {
    reload();
  }, [reload]);

  const canRequest =
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    amountNumber >= MIN_PAYOUT_NGN &&
    amountNumber <= availableEarnings &&
    availableEarnings > 0 &&
    !requesting;

  async function requestPayout() {
    if (!canRequest) return;
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/agents/payout-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount_ngn: amountNumber, requested_note: clean(payoutNote) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(String(json?.error || `Failed (${res.status})`));
        return;
      }
      setPayoutAmount("");
      setPayoutNote("");
      await reload();
    } finally {
      setRequesting(false);
    }
  }

  return (
    <AgentAppShell title="Payouts" subtitle="Review commissions and submit payout requests.">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Commission</p>
              <p className="mt-1 text-xs text-neutral-500">Tracked earnings from completed projects.</p>
            </div>
            <button
              type="button"
              onClick={reload}
              className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6">
            <p className="text-2xl font-semibold text-neutral-900">{formatNaira(availableEarnings, 2)}</p>
            <p className="mt-1 text-xs text-neutral-500">Available earnings</p>
          </div>

          {loading ? (
            <p className="mt-4 text-xs text-neutral-500">Loading commission details…</p>
          ) : (
            <div className="mt-4 grid gap-3 text-xs text-neutral-600">
              <div className="flex items-center justify-between">
                <span>Commission per project</span>
                <span className="font-semibold text-neutral-900">{Number(commission?.agent_percent || 0)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Commitment holdback</span>
                <span className="font-semibold text-neutral-900">
                  {Number(commission?.agent_commitment_percent || 0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Locked earnings</span>
                <span className="font-semibold text-neutral-900">{formatNaira(Number(earnings?.locked_ngn || 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Paid out</span>
                <span className="font-semibold text-neutral-900">{formatNaira(Number(earnings?.paid_out_ngn || 0))}</span>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.1)] bg-[rgba(45,52,97,0.04)] px-4 py-3">
            <p className="text-xs text-neutral-600">
              Keep your payout account verified in settings to request payouts without delays.
            </p>
            <Link href="/agent-app/settings" className="mt-2 inline-flex text-xs font-semibold text-[#2D3461]">
              Manage payout account
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-neutral-900">Request payout</p>
          <p className="mt-1 text-xs text-neutral-500">Withdraw from your available earnings.</p>

          <div className="mt-4 grid gap-3 text-xs text-neutral-600">
            <p>Available: {formatNaira(availableEarnings, 2)}</p>
            <p>Minimum request: NGN {MIN_PAYOUT_NGN.toLocaleString("en-NG")}</p>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Amount (NGN)</label>
            <input
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="1000"
              inputMode="decimal"
              className="w-full rounded-2xl border border-[rgba(45,52,97,0.18)] bg-white px-4 py-3 text-sm text-neutral-900 shadow-[0_10px_30px_rgba(15,23,42,0.06)] focus:border-[#2D3461] focus:outline-none"
            />

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Note (optional)</label>
            <input
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              placeholder="Reason or note"
              className="w-full rounded-2xl border border-[rgba(45,52,97,0.18)] bg-white px-4 py-3 text-sm text-neutral-900 shadow-[0_10px_30px_rgba(15,23,42,0.06)] focus:border-[#2D3461] focus:outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPayoutAmount(String(Math.max(0, availableEarnings).toFixed(2)))}
              disabled={availableEarnings <= 0 || requesting}
              className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] transition hover:bg-[rgba(45,52,97,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Withdraw all
            </button>
            <button
              type="button"
              onClick={requestPayout}
              disabled={!canRequest}
              className="rounded-full bg-[#2D3461] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[0_15px_30px_rgba(45,52,97,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(45,52,97,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requesting ? "Requesting…" : "Request payout"}
            </button>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Payout history</p>
            <p className="mt-1 text-xs text-neutral-500">Track all requests and approvals.</p>
          </div>
        </div>

        {payoutLoading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading payout history…</p>
        ) : payouts.length ? (
          <div className="mt-4 grid gap-3">
            {payouts.map((payout) => {
              const chip = statusChip(payout.status);
              return (
                <div
                  key={payout.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{formatKobo(payout.amount_kobo)}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Requested {String(payout.requested_at || "").replace("T", " ").slice(0, 19)}
                    </p>
                    {payout.paid_at ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        Paid {String(payout.paid_at || "").replace("T", " ").slice(0, 19)}
                      </p>
                    ) : null}
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${chip.bg} ${chip.text}`}>
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">No payout requests yet. Complete projects to start earning.</p>
        )}
      </section>
    </AgentAppShell>
  );
}
