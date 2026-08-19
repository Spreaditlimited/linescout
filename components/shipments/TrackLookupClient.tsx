"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock3,
  PackageSearch,
  Search,
  ShieldCheck,
} from "lucide-react";

type ShipmentEvent = {
  status: string;
  status_label: string;
  notes: string | null;
  event_time: string;
  source: string;
};

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
      events: ShipmentEvent[];
    }
  | { ok: false; error: string };

export default function TrackLookupClient({
  initialTrackingId = "",
}: {
  initialTrackingId?: string;
}) {
  const router = useRouter();
  const [trackingId, setTrackingId] = useState(initialTrackingId);
  const [loading, setLoading] = useState(Boolean(initialTrackingId));
  const [result, setResult] = useState<TrackResponse | null>(null);

  useEffect(() => {
    if (!initialTrackingId) return;
    let cancelled = false;

    async function loadShipment() {
      setLoading(true);
      setResult(null);
      try {
        const response = await fetch(
          `/api/shipments/track?tracking_id=${encodeURIComponent(initialTrackingId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as TrackResponse | null;
        if (!cancelled) {
          setResult(payload || { ok: false, error: "Unable to load tracking." });
        }
      } catch {
        if (!cancelled) {
          setResult({ ok: false, error: "Unable to load tracking." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadShipment();
    return () => {
      cancelled = true;
    };
  }, [initialTrackingId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = trackingId.trim();
    if (value) router.push(`/track/${encodeURIComponent(value)}`);
  }

  const shipment = result?.ok ? result.shipment : null;
  const events = result?.ok ? [...(result.events || [])].reverse() : [];

  return (
    <main className="min-h-[75vh] bg-slate-50 px-4 pb-20 pt-32 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <PackageSearch className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-orange-600 dark:text-orange-400">
            LineScout Shipping
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Track your shipment
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Enter the unique tracking ID provided for your LineScout shipment.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mx-auto mt-8 flex max-w-2xl gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20"
        >
          <input
            value={trackingId}
            onChange={(event) => setTrackingId(event.target.value)}
            aria-label="Shipment tracking ID"
            autoComplete="off"
            placeholder="Enter your tracking ID"
            className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/20 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Track
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Your LineScout shipment ID is your tracking ID.
        </p>

        {loading ? (
          <div className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400" role="status">
            Loading shipment progress…
          </div>
        ) : null}

        {result && !result.ok && !loading ? (
          <div
            className="mx-auto mt-10 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {result.error || "Shipment not found."}
          </div>
        ) : null}

        {shipment && !loading ? (
          <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <header className="border-b border-slate-800 bg-slate-950 p-6 text-white md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Tracking ID
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold">{shipment.tracking_id}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Current status
                  </p>
                  <p className="mt-2 font-bold text-emerald-400">{shipment.status_label}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                {shipment.origin_country || "Origin"} → {shipment.destination_country || "Destination"}
                {shipment.carrier ? ` · ${shipment.carrier}` : ""}
              </div>
              {shipment.last_event_at ? (
                <p className="mt-3 text-xs text-slate-400">
                  Last updated {new Date(shipment.last_event_at).toLocaleString()}
                </p>
              ) : null}
            </header>

            <div className="p-6 md:p-8">
              {events.length ? (
                events.map((event, index) => {
                  const current = index === events.length - 1;
                  const isLast = index === events.length - 1;
                  return (
                    <div key={`${event.status}-${event.event_time}-${index}`} className="grid grid-cols-[2rem_1fr] gap-4">
                      <div className="flex flex-col items-center">
                        {current ? (
                          <Clock3 className="h-6 w-6 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                        )}
                        {!isLast ? (
                          <div className="min-h-14 w-0.5 flex-1 bg-emerald-300 dark:bg-emerald-800" />
                        ) : null}
                      </div>
                      <div className="pb-7">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className={`font-bold ${current ? "text-blue-700 dark:text-blue-400" : "text-slate-950 dark:text-white"}`}>
                            {event.status_label}
                          </p>
                          <time className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(event.event_time).toLocaleString()}
                          </time>
                        </div>
                        {event.notes ? (
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{event.notes}</p>
                        ) : current ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current shipment stage</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="grid grid-cols-[2rem_1fr] gap-4">
                  <div className="flex justify-center">
                    <Circle className="h-6 w-6 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold text-blue-700 dark:text-blue-400">{shipment.status_label}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      We’ll add shipment updates here as they are received.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
