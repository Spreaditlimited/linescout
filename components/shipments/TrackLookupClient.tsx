"use client";

import { useState } from "react";

type TrackResponse =
  | {
      ok: true;
      shipment: {
        tracking_id: string;
        status: string;
        status_label: string;
        origin_country: string | null;
        destination_country: string | null;
        carrier: string | null;
        carrier_tracking_number: string | null;
        eta_date: string | null;
        last_event_at: string | null;
      };
      events: Array<{
        status: string;
        status_label: string;
        notes: string | null;
        event_time: string;
        source: string;
      }>;
    }
  | { ok: false; error: string };

export default function TrackLookupClient() {
  const [trackingId, setTrackingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResponse | null>(null);

  async function submit() {
    const value = trackingId.trim();
    if (!value) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/shipments/track?tracking_id=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as TrackResponse | null;
      setResult(json || { ok: false, error: "Unable to load tracking." });
    } catch {
      setResult({ ok: false, error: "Unable to load tracking." });
    } finally {
      setLoading(false);
    }
  }

  const ok = result && result.ok;

  return (
    <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:pt-20">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
          Tracking
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Track your shipment
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700 sm:text-base">
          Enter your LineScout tracking ID to see the latest shipment updates.
        </p>
      </div>

      <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">Tracking ID</p>
        <div className="mt-4 flex flex-col gap-3">
          <input
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="LS-TRK-XXXXXX"
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !trackingId.trim()}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Checking..." : "Track shipment"}
          </button>
        </div>
      </div>

      {result ? (
        <div className="md:col-span-2 rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          {ok ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
                    Tracking ID
                  </p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">
                    {result.shipment.tracking_id}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-700">
                  {result.shipment.status_label}
                </div>
              </div>

              <div className="mt-4 grid gap-4 text-sm text-neutral-600 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Route
                  </div>
                  <div className="mt-1 text-neutral-800">
                    {result.shipment.origin_country || "Origin"} →{" "}
                    {result.shipment.destination_country || "Destination"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Carrier
                  </div>
                  <div className="mt-1 text-neutral-800">
                    {result.shipment.carrier || "LineScout partner"}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Shipment updates
                </p>
                <div className="mt-3 space-y-3">
                  {(result.events || []).length ? (
                    result.events.map((event, idx) => (
                      <div
                        key={`${event.status}-${event.event_time}-${idx}`}
                        className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="font-semibold text-neutral-900">{event.status_label}</div>
                          <div className="text-xs text-neutral-500">
                            {new Date(event.event_time).toLocaleString()}
                          </div>
                        </div>
                        {event.notes ? (
                          <p className="mt-1 text-xs text-neutral-600">{event.notes}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">
                      We’ll show updates here as soon as we receive them.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-600">{result.error || "Unable to load tracking."}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
