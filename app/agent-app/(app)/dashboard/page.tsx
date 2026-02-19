"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AgentAppShell from "../_components/AgentAppShell";

type PaidItem = {
  conversation_id: number;
  handoff_id: number | null;
  handoff_status?: string | null;
  last_message_at?: string | null;
  customer_name?: string | null;
};

type QuoteItem = {
  id: number;
  created_at?: string | null;
  total_due_ngn?: number | null;
};

type PayoutItem = {
  id: number;
  amount_kobo: number;
  status: string;
  requested_at?: string | null;
};

type Earnings = {
  gross_earned_ngn: number;
  paid_out_ngn: number;
  locked_ngn: number;
  available_ngn: number;
};

function timeAgoSafe(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return "";
  const diff = Math.max(Date.now() - t, 0);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [paid, setPaid] = useState<PaidItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [paidRes, quotesRes, payoutRes, commissionRes, profileRes] = await Promise.all([
        fetch("/api/internal/paid-chat/inbox?limit=80&cursor=0&kind=paid&scope=mine", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/internal/quotes?scope=mine", { cache: "no-store", credentials: "include" }),
        fetch("/api/internal/agents/payout-requests/mine?limit=20", { cache: "no-store", credentials: "include" }),
        fetch("/api/internal/agents/commission", { cache: "no-store", credentials: "include" }),
        fetch("/api/internal/agents/profile/me", { cache: "no-store", credentials: "include" }),
      ]);

      const paidJson = await paidRes.json().catch(() => ({}));
      const quotesJson = await quotesRes.json().catch(() => ({}));
      const payoutJson = await payoutRes.json().catch(() => ({}));
      const commissionJson = await commissionRes.json().catch(() => ({}));
      const profileJson = await profileRes.json().catch(() => ({}));

      if (paidRes.ok && paidJson?.ok) setPaid(Array.isArray(paidJson.items) ? paidJson.items : []);
      if (quotesRes.ok && quotesJson?.ok) setQuotes(Array.isArray(quotesJson.items) ? quotesJson.items : []);
      if (payoutRes.ok && payoutJson?.ok) setPayouts(Array.isArray(payoutJson.items) ? payoutJson.items : []);
      if (commissionRes.ok && commissionJson?.ok) setEarnings(commissionJson.earnings || null);
      if (profileRes.ok && profileJson?.ok) setApprovalStatus(String(profileJson?.profile?.approval_status || ""));

      if (!paidRes.ok || !quotesRes.ok) {
        setErr(paidJson?.error || quotesJson?.error || "Failed to load dashboard data.");
      }
    } catch (e: any) {
      setErr(e?.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeProjects = useMemo(() => {
    return paid.filter((p) => {
      const status = String(p.handoff_status || "").toLowerCase();
      return status !== "delivered" && status !== "cancelled";
    }).length;
  }, [paid]);

  const pendingPayouts = useMemo(() => {
    return payouts.filter((p) => ["pending", "approved"].includes(String(p.status || "").toLowerCase())).length;
  }, [payouts]);

  const recentActivity = useMemo(() => {
    const items: { label: string; when?: string | null; href?: string }[] = [];
    paid.slice(0, 3).forEach((p) => {
      items.push({
        label: `Paid chat · ${p.customer_name || "Customer"}`,
        when: p.last_message_at,
        href: p.handoff_id ? `/agent-app/projects/${p.handoff_id}` : undefined,
      });
    });
    quotes.slice(0, 2).forEach((q) => {
      items.push({
        label: `Quote #${q.id} created`,
        when: q.created_at,
        href: undefined,
      });
    });
    return items.slice(0, 5);
  }, [paid, quotes]);

  const stats = [
    { label: "Paid chats", value: paid.length.toString(), note: "Claimed chats" },
    { label: "Projects", value: activeProjects.toString(), note: "Active handoffs" },
    { label: "Quotes", value: quotes.length.toString(), note: "Created by you" },
    {
      label: "Payouts",
      value: pendingPayouts.toString(),
      note: "Pending requests",
    },
  ];
  const approvalLower = String(approvalStatus || "").trim().toLowerCase();
  const needsVerification = !approvalLower || approvalLower === "pending";

  return (
    <AgentAppShell title="Dashboard" subtitle="Snapshot of your agent workspace activity.">
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading dashboard…
        </div>
      ) : (
        <div className="grid gap-6">
          {needsVerification ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
              <p className="font-semibold text-amber-900">Complete your verification process</p>
              <p className="mt-1 text-sm text-amber-700">
                Finish your settings and verification steps to unlock the workspace.
              </p>
              <Link
                href="/agent-app/settings"
                className="btn btn-outline mt-3 px-4 py-2 text-xs border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              >
                Go to settings
              </Link>
            </section>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">{item.value}</p>
                <p className="mt-1 text-xs text-neutral-500">{item.note}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Recent activity</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Latest chats and quotes across your workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={load}
                  className="btn btn-outline px-4 py-2 text-xs"
                >
                  Refresh
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {recentActivity.length ? (
                  recentActivity.map((item, idx) => (
                    <div
                      key={`${item.label}-${idx}`}
                      className="flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-neutral-900">{item.label}</p>
                        <p className="text-xs text-neutral-500">{timeAgoSafe(item.when)}</p>
                      </div>
                      {item.href ? (
                        <Link href={item.href} className="text-xs font-semibold text-[#2D3461]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500">No recent activity yet.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
                <p className="text-sm font-semibold text-neutral-900">Earnings snapshot</p>
                {earnings ? (
                  <div className="mt-4 space-y-2 text-sm text-neutral-600">
                    <div className="flex items-center justify-between">
                      <span>Available</span>
                      <span className="font-semibold text-neutral-900">
                        NGN {earnings.available_ngn.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Locked</span>
                      <span className="font-semibold text-neutral-900">
                        NGN {earnings.locked_ngn.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Paid out</span>
                      <span className="font-semibold text-neutral-900">
                        NGN {earnings.paid_out_ngn.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">Earnings data not available.</p>
                )}
              </div>

              <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-5">
                <p className="text-sm font-semibold text-neutral-900">Approval status</p>
                <p className="mt-2 text-sm text-neutral-600">
                  {approvalStatus ? approvalStatus.replace(/\\b\\w/g, (m) => m.toUpperCase()) : "Unknown"}
                </p>
                <Link
                  href="/agent-app/profile"
                  className="btn btn-outline mt-3 px-4 py-2 text-xs"
                >
                  Update profile
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}
    </AgentAppShell>
  );
}
