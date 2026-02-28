"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ShipmentRow = {
  id: number;
  public_tracking_id: string;
  status: string | null;
  contact_email: string | null;
  origin_country: string | null;
  destination_country: string | null;
  carrier: string | null;
  carrier_tracking_number: string | null;
  created_at: string;
};

export default function ShipmentsAdminClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load(query = "") {
    setLoading(true);
    setError(null);
    try {
      const qs = query ? `?q=${encodeURIComponent(query)}` : "";
      const res = await fetch(`/api/internal/shipments${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to load shipments.");
      setShipments(Array.isArray(json.shipments) ? json.shipments : []);
    } catch (e: any) {
      setError(e?.message || "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Admin</p>
          <h1 className="text-2xl font-semibold text-neutral-100">Shipments</h1>
          <p className="text-sm text-neutral-400">
            Manage LineScout tracking, update events, and audit shipment changes.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tracking ID, email, carrier..."
            className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-100"
          />
          <button
            type="button"
            onClick={() => load(q.trim())}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200"
          >
            Search
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-amber-400">{error}</div> : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        {loading ? (
          <div className="text-sm text-neutral-400">Loading shipments...</div>
        ) : shipments.length ? (
          <div className="space-y-3">
            {shipments.map((s) => (
              <Link
                key={s.id}
                href={`/internal/shipments/${s.id}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                      {s.public_tracking_id}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      {s.origin_country || "Origin"} → {s.destination_country || "Destination"}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {s.contact_email || "No email"} • {s.carrier || "Carrier"}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-neutral-300">{s.status || "created"}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-400">No shipments found.</div>
        )}
      </div>
    </div>
  );
}
