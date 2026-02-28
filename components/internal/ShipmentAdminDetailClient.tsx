"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DetailResponse =
  | { ok: true; shipment: any; events: any[]; changes: any[]; packages?: any[] }
  | { ok: false; error: string };

type ShippingCompany = { id: number; name: string; is_active: number };
type ShippingRate = {
  id: number;
  shipping_type_id: number | null;
  shipping_type_name: string | null;
  rate_value: number | null;
  rate_unit: string;
  currency: string | null;
  country_name: string | null;
  country_iso2: string | null;
};

const STATUS_OPTIONS = [
  { value: "created", label: "Created" },
  { value: "picked_up", label: "Picked up" },
  { value: "departed_origin", label: "Departed origin" },
  { value: "arrived_destination", label: "Arrived destination" },
  { value: "customs", label: "Customs" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "ready_for_pickup", label: "Ready for pickup" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
  { value: "shipped", label: "Shipped" },
];

export default function ShipmentAdminDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<DetailResponse | null>(null);
  const [eventForm, setEventForm] = useState({
    status: "created",
    label: "",
    notes: "",
    event_time: "",
  });
  const [editForm, setEditForm] = useState({
    origin_country: "",
    destination_country: "",
    destination_country_id: 0,
    carrier: "",
    carrier_tracking_number: "",
    contact_name: "",
    contact_email: "",
    shipment_details: "",
    shipping_type_id: 0,
    shipping_rate_id: 0,
    shipping_rate_unit: "",
    shipping_rate_value: "",
    shipping_units: "",
    estimated_shipping_usd: "",
    estimated_shipping_amount: "",
    estimated_shipping_currency: "",
  });
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [saving, setSaving] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const selectedRate = useMemo(
    () => shippingRates.find((rate) => rate.id === Number(editForm.shipping_rate_id || 0)) || null,
    [shippingRates, editForm.shipping_rate_id]
  );
  const effectiveCurrency = useMemo(() => {
    return String(
      editForm.estimated_shipping_currency || selectedRate?.currency || "USD"
    ).toUpperCase();
  }, [editForm.estimated_shipping_currency, selectedRate]);

  useEffect(() => {
    const nextCurrency = String(
      editForm.estimated_shipping_currency || selectedRate?.currency || "USD"
    ).toUpperCase();
    const rate = Number(editForm.shipping_rate_value || selectedRate?.rate_value || 0);
    const units = Number(editForm.shipping_units || 0);
    const canCompute = Number.isFinite(rate) && Number.isFinite(units) && rate > 0 && units > 0;
    const computed = canCompute ? rate * units : 0;
    setEditForm((prev) => {
      const updates: any = {};
      if (!prev.estimated_shipping_currency && nextCurrency) {
        updates.estimated_shipping_currency = nextCurrency;
      }
      if (canCompute) {
        const usd = computed.toFixed(2);
        if (prev.estimated_shipping_usd !== usd) {
          updates.estimated_shipping_usd = usd;
        }
        if (nextCurrency === "USD" || !prev.estimated_shipping_amount) {
          if (prev.estimated_shipping_amount !== usd) {
            updates.estimated_shipping_amount = usd;
          }
        }
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [
    editForm.estimated_shipping_currency,
    editForm.shipping_rate_value,
    editForm.shipping_units,
    editForm.shipping_rate_id,
    selectedRate,
  ]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/internal/shipments/${id}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as DetailResponse | null;
    setState(json || { ok: false, error: "Unable to load shipment." });
    if (json?.ok) {
      const shipment = json.shipment || {};
      setEditForm({
        origin_country: shipment.origin_country || "",
        destination_country: shipment.destination_country || "",
        destination_country_id: Number(shipment.destination_country_id || 0),
        carrier: shipment.carrier || "",
        carrier_tracking_number: shipment.carrier_tracking_number || "",
        contact_name: shipment.contact_name || "",
        contact_email: shipment.contact_email || "",
        shipment_details: shipment.shipment_details || "",
        shipping_type_id: Number(shipment.shipping_type_id || 0),
        shipping_rate_id: Number(shipment.shipping_rate_id || 0),
        shipping_rate_unit: shipment.shipping_rate_unit || "",
        shipping_rate_value: shipment.shipping_rate_value ? String(shipment.shipping_rate_value) : "",
        shipping_units: shipment.shipping_units ? String(shipment.shipping_units) : "",
        estimated_shipping_usd: shipment.estimated_shipping_usd ? String(shipment.estimated_shipping_usd) : "",
        estimated_shipping_amount: shipment.estimated_shipping_amount ? String(shipment.estimated_shipping_amount) : "",
        estimated_shipping_currency: shipment.estimated_shipping_currency || "",
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    (async () => {
      const [companiesRes, ratesRes] = await Promise.all([
        fetch("/api/linescout-shipping-companies"),
        fetch("/api/internal/shipping-rates"),
      ]);
      const companiesJson = await companiesRes.json().catch(() => null);
      const ratesJson = await ratesRes.json().catch(() => null);
      if (companiesRes.ok && companiesJson?.ok) {
        setShippingCompanies(Array.isArray(companiesJson.items) ? companiesJson.items : []);
      }
      if (ratesRes.ok && ratesJson?.ok) {
        setShippingRates(Array.isArray(ratesJson.items) ? ratesJson.items : []);
      }
    })();
  }, []);

  async function addEvent() {
    const res = await fetch(`/api/internal/shipments/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventForm),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      setEventForm({ status: "created", label: "", notes: "", event_time: "" });
      await load();
    } else {
      setState({ ok: false, error: json?.error || "Unable to add event." });
    }
  }

  async function syncCarrier() {
    const res = await fetch(`/api/internal/shipments/${id}/sync`, { method: "POST" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      await load();
    } else {
      setState({ ok: false, error: json?.error || "Unable to sync carrier." });
    }
  }

  async function saveDetails() {
    setSaving(true);
    try {
      const res = await fetch(`/api/internal/shipments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          destination_country_id: editForm.destination_country_id || null,
          shipping_type_id: editForm.shipping_type_id || null,
          shipping_rate_id: editForm.shipping_rate_id || null,
          shipping_rate_value: editForm.shipping_rate_value ? Number(editForm.shipping_rate_value) : null,
          shipping_units: editForm.shipping_units ? Number(editForm.shipping_units) : null,
          estimated_shipping_usd: editForm.estimated_shipping_usd ? Number(editForm.estimated_shipping_usd) : null,
          estimated_shipping_amount: editForm.estimated_shipping_amount ? Number(editForm.estimated_shipping_amount) : null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to save shipment.");
      await load();
    } catch (e: any) {
      setState({ ok: false, error: e?.message || "Unable to save shipment." });
    } finally {
      setSaving(false);
    }
  }

  async function createQuote() {
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/internal/shipments/${id}/quote`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to create invoice.");
      if (json?.token) {
        window.open(`/shipping-quote/${encodeURIComponent(json.token)}`, "_blank");
      }
      await load();
    } catch (e: any) {
      setState({ ok: false, error: e?.message || "Unable to create invoice." });
    } finally {
      setQuoteLoading(false);
    }
  }

  async function sendInvoice() {
    if (!shipment?.quote_token || !shipment?.id) return;
    setSendLoading(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/internal/shipping-quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_token: shipment.quote_token, shipment_id: shipment.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to send invoice.");
      setSendMsg("Invoice sent to customer email.");
    } catch (e: any) {
      setSendMsg(e?.message || "Unable to send invoice.");
    } finally {
      setSendLoading(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-neutral-400">Loading shipment...</div>;
  }

  if (!state || !state.ok) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6 text-sm text-neutral-300">
        {state?.error || "Unable to load shipment."}
      </div>
    );
  }

  const shipment = state.shipment;
  const packages = state.packages || [];

  return (
    <div className="space-y-6">
      <Link href="/internal/shipments" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Back to shipments
      </Link>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">
              {shipment.public_tracking_id}
            </div>
            <div className="mt-2 text-xl font-semibold text-neutral-100">
              {shipment.origin_country || "Origin"} → {shipment.destination_country || "Destination"}
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              {(shipment.contact_email || shipment.user_email || "No email")} • {shipment.carrier || "Carrier"}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {shipment.contact_name ||
                shipment.user_name ||
                [shipment.user_first_name, shipment.user_last_name].filter(Boolean).join(" ").trim() ||
                "No name"}{" "}
              • User ID {shipment.user_id || "—"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-xs font-semibold text-neutral-300">{shipment.status || "created"}</div>
            {shipment.provider_tracker_id && String(shipment.tracking_provider || "") === "easypost" ? (
              <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                EasyPost active
              </div>
            ) : (
              <div className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[11px] font-semibold text-neutral-300">
                Manual updates
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={syncCarrier}
          className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200"
        >
          Sync carrier updates
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">Packages</h2>
          {packages.length ? (
            <button
              type="button"
              onClick={async () => {
                await Promise.all(
                  packages.map((pkg: any) =>
                    fetch(`/api/internal/shipments/${shipment.id}/packages/${pkg.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "received" }),
                    })
                  )
                );
                await load();
              }}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"
            >
              Mark all received
            </button>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {packages.length ? (
            packages.map((pkg: any) => (
              <div key={pkg.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-neutral-100">{pkg.title}</div>
                    <div className="text-xs text-neutral-400">
                      Qty: {pkg.quantity} {pkg.supplier_name ? `• ${pkg.supplier_name}` : ""}
                    </div>
                    {pkg.notes ? <div className="text-xs text-neutral-500">{pkg.notes}</div> : null}
                  </div>
                  <PackageStatusControls shipmentId={shipment.id} pkg={pkg} onChange={load} />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-neutral-400">No packages added yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <h2 className="text-sm font-semibold text-neutral-100">Shipment details</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-400">
            Origin country
            <input
              value={editForm.origin_country}
              onChange={(e) => setEditForm((prev) => ({ ...prev, origin_country: e.target.value }))}
              placeholder="Origin country"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Destination country
            <input
              value={editForm.destination_country}
              onChange={(e) => setEditForm((prev) => ({ ...prev, destination_country: e.target.value }))}
              placeholder="Destination country"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Carrier
            <select
              value={editForm.carrier || ""}
              onChange={(e) => setEditForm((prev) => ({ ...prev, carrier: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            >
              <option value="">Select carrier</option>
              {shippingCompanies.map((company) => (
                <option key={company.id} value={company.name}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Carrier tracking number
            <input
              value={editForm.carrier_tracking_number}
              onChange={(e) => setEditForm((prev) => ({ ...prev, carrier_tracking_number: e.target.value }))}
              placeholder="Carrier tracking number"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Contact name
            <input
              value={editForm.contact_name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, contact_name: e.target.value }))}
              placeholder="Contact name"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Contact email
            <input
              value={editForm.contact_email}
              onChange={(e) => setEditForm((prev) => ({ ...prev, contact_email: e.target.value }))}
              placeholder="Contact email"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400 md:col-span-2">
            Shipment details
            <textarea
              value={editForm.shipment_details}
              onChange={(e) => setEditForm((prev) => ({ ...prev, shipment_details: e.target.value }))}
              placeholder="Shipment details"
              className="mt-1 min-h-[96px] w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-400">
            Shipping rate (type / country / unit)
            <select
              value={editForm.shipping_rate_id || ""}
              onChange={(e) => {
                const rateId = Number(e.target.value || 0);
                const rate = shippingRates.find((r) => r.id === rateId);
                setEditForm((prev) => ({
                  ...prev,
                  shipping_rate_id: rateId,
                  shipping_type_id: Number(rate?.shipping_type_id || 0),
                  shipping_rate_unit: rate?.rate_unit || "",
                  shipping_rate_value: rate?.rate_value ? String(rate.rate_value) : "",
                }));
              }}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            >
              <option value="">Select rate</option>
              {shippingRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.shipping_type_name || "Shipping"} · {rate.country_iso2 || ""} ·{" "}
                  {rate.rate_unit === "per_cbm" ? "Per CBM" : "Per KG"} · {rate.rate_value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Shipping units ({selectedRate?.rate_unit === "per_cbm" ? "CBM" : "KG"})
            <input
              value={editForm.shipping_units}
              onChange={(e) => setEditForm((prev) => ({ ...prev, shipping_units: e.target.value }))}
              placeholder={selectedRate?.rate_unit === "per_cbm" ? "Total CBM" : "Total KG"}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Shipping rate value (USD)
            <input
              value={editForm.shipping_rate_value}
              onChange={(e) => setEditForm((prev) => ({ ...prev, shipping_rate_value: e.target.value }))}
              placeholder="Rate value (USD)"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Shipping rate unit
            <input
              value={editForm.shipping_rate_unit}
              onChange={(e) => setEditForm((prev) => ({ ...prev, shipping_rate_unit: e.target.value }))}
              placeholder="per_kg or per_cbm"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Estimated shipping (USD)
            <input
              value={editForm.estimated_shipping_usd}
              onChange={(e) => setEditForm((prev) => ({ ...prev, estimated_shipping_usd: e.target.value }))}
              placeholder="Estimated shipping USD"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Estimated shipping (local amount)
            <input
              value={editForm.estimated_shipping_amount}
              onChange={(e) => setEditForm((prev) => ({ ...prev, estimated_shipping_amount: e.target.value }))}
              placeholder="Estimated shipping amount"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Estimated shipping currency
            <input
              value={editForm.estimated_shipping_currency}
              readOnly
              placeholder={effectiveCurrency}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200/80"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveDetails}
            disabled={saving}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save shipment details"}
          </button>
          <button
            type="button"
            onClick={createQuote}
            disabled={quoteLoading}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-60"
          >
            {quoteLoading ? "Preparing invoice..." : "Create shipping invoice"}
          </button>
          {shipment.quote_token ? (
            <Link
              href={`/shipping-quote/${encodeURIComponent(shipment.quote_token)}`}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200"
              target="_blank"
            >
              View latest invoice
            </Link>
          ) : null}
          {shipment.quote_token ? (
            <button
              type="button"
              onClick={sendInvoice}
              disabled={sendLoading}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-60"
            >
              {sendLoading ? "Sending..." : "Send invoice"}
            </button>
          ) : null}
        </div>
        {sendMsg ? <div className="mt-3 text-xs text-neutral-400">{sendMsg}</div> : null}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <h2 className="text-sm font-semibold text-neutral-100">Add shipment update</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-400">
            Status
            <select
              value={eventForm.status}
              onChange={(e) => setEventForm((prev) => ({ ...prev, status: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Event time
            <input
              value={eventForm.event_time}
              onChange={(e) => setEventForm((prev) => ({ ...prev, event_time: e.target.value }))}
              placeholder="YYYY-MM-DD HH:mm"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Label (optional)
            <input
              value={eventForm.label}
              onChange={(e) => setEventForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Short label"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-400">
            Notes
            <input
              value={eventForm.notes}
              onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes"
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={addEvent}
          className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200"
        >
          Add update
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <h2 className="text-sm font-semibold text-neutral-100">Timeline</h2>
        <div className="mt-4 space-y-3">
          {(state.events || []).length ? (
            state.events.map((event: any, idx: number) => (
              <div key={`${event.id || idx}`} className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold text-neutral-100">{event.status}</div>
                  <div className="text-xs text-neutral-400">
                    {event.event_time ? new Date(event.event_time).toLocaleString() : ""}
                  </div>
                </div>
                {event.notes ? <div className="mt-1 text-xs text-neutral-400">{event.notes}</div> : null}
              </div>
            ))
          ) : (
            <div className="text-sm text-neutral-400">No updates yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
        <h2 className="text-sm font-semibold text-neutral-100">Change log</h2>
        <div className="mt-4 space-y-3">
          {(state.changes || []).length ? (
            state.changes.map((change: any, idx: number) => (
              <div key={`${change.id || idx}`} className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="text-xs text-neutral-300">
                  {change.field_name}: {String(change.old_value || "—")} → {String(change.new_value || "—")}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {change.created_at ? new Date(change.created_at).toLocaleString() : ""}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-neutral-400">No edits yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PackageStatusControls({
  shipmentId,
  pkg,
  onChange,
}: {
  shipmentId: number;
  pkg: any;
  onChange: () => void;
}) {
  const [status, setStatus] = useState(pkg.status || "pending");
  const [saving, setSaving] = useState(false);

  async function updateStatus(next: string) {
    setSaving(true);
    setStatus(next);
    try {
      const res = await fetch(`/api/internal/shipments/${shipmentId}/packages/${pkg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to update package.");
      }
      await onChange();
    } catch {
      setStatus(pkg.status || "pending");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => updateStatus(e.target.value)}
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
        disabled={saving}
      >
        <option value="pending">Pending</option>
        <option value="received">Received</option>
        <option value="missing">Missing</option>
      </select>
      {pkg.received_at ? (
        <span className="text-[11px] text-neutral-400">
          {new Date(pkg.received_at).toLocaleDateString()}
        </span>
      ) : null}
    </div>
  );
}
