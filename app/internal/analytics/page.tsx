"use client";

import { useEffect, useMemo, useState } from "react";

type AnalyticsResponse =
  | {
      ok: true;
      metrics: {
        total_leads: number;
        new_leads: number;
        claimed_leads: number;
        called_leads: number;

        total_handoffs: number;
        new_handoffs: number;
        active_handoffs: number;

        unique_chat_users: number;
        unique_leads_users: number;
        lead_conversion_rate: number; // % chat->lead (best effort)
      };
    }
  | { ok: false; error: string };

export default function InternalAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/internal/analytics", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as AnalyticsResponse | null;
      setData(json ?? { ok: false, error: "Failed to load analytics" });
    } catch {
      setData({ ok: false, error: "Failed to load analytics" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const ok = useMemo(() => !!(data && "ok" in data && data.ok), [data]);
  const m = ok ? (data as any).metrics : null;

  const Card = ({ label, value }: { label: string; value: any }) => (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-neutral-100">{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Analytics</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Quick visibility on leads, sourcing projects, and funnel movement.
            </p>
          </div>

          <button
            onClick={load}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-neutral-400">Loading...</p> : null}

      {!loading && data && !ok ? (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-200">
          {(data as any).error || "Failed to load analytics"}
        </div>
      ) : null}

      {!loading && ok && m ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card label="Total leads" value={m.total_leads} />
          <Card label="New leads" value={m.new_leads} />
          <Card label="Claimed leads" value={m.claimed_leads} />
          <Card label="Called leads" value={m.called_leads} />

          <Card label="Total sourcing projects" value={m.total_handoffs} />
          <Card label="New sourcing projects" value={m.new_handoffs} />
          <Card label="Active sourcing projects" value={m.active_handoffs} />

          <Card label="Unique chat users" value={m.unique_chat_users} />
          <Card label="Unique leads users" value={m.unique_leads_users} />
          <Card label="Chat → Lead conversion" value={`${m.lead_conversion_rate.toFixed(1)}%`} />
        </div>
      ) : null}
    </div>
  );
}