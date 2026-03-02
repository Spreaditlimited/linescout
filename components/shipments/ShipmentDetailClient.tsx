"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DetailResponse =
  | { ok: true; shipment: any; events: any[]; packages?: any[] }
  | { ok: false; error: string };

type ShippingRate = {
  id: number;
  shipping_type_id: number | null;
  shipping_type_name: string | null;
  rate_value: number | null;
  rate_unit: "per_kg" | "per_cbm" | string;
  currency: string | null;
  country_id: number | null;
};

export default function ShipmentDetailClient({ trackingId }: { trackingId: string }) {
  const [state, setState] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [confirmDeletePackageId, setConfirmDeletePackageId] = useState<number | null>(null);
  const [confirmDeleteShipment, setConfirmDeleteShipment] = useState(false);
  const [packageForm, setPackageForm] = useState({
    title: "",
    quantity: "1",
    supplier_name: "",
    notes: "",
  });
  const [editingPackageId, setEditingPackageId] = useState<number | null>(null);
  const [editingPackage, setEditingPackage] = useState({
    title: "",
    quantity: "1",
    supplier_name: "",
    notes: "",
  });
  const [form, setForm] = useState({
    origin_country: "",
    destination_country: "",
    carrier: "",
    carrier_tracking_number: "",
    eta_date: "",
    shipment_details: "",
    shipping_rate_id: 0,
    shipping_type_id: 0,
    shipping_rate_unit: "",
    shipping_rate_value: "",
    shipping_units: "",
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as DetailResponse | null;
      setState(json || { ok: false, error: "Unable to load shipment." });
      if (json?.ok) {
        setForm({
          origin_country: json.shipment.origin_country || "",
          destination_country: json.shipment.destination_country || "",
          carrier: json.shipment.carrier || "",
          carrier_tracking_number: json.shipment.carrier_tracking_number || "",
          eta_date: json.shipment.eta_date || "",
          shipment_details: json.shipment.shipment_details || "",
          shipping_rate_id: Number(json.shipment.shipping_rate_id || 0),
          shipping_type_id: Number(json.shipment.shipping_type_id || 0),
          shipping_rate_unit: json.shipment.shipping_rate_unit || "",
          shipping_rate_value: json.shipment.shipping_rate_value ? String(json.shipment.shipping_rate_value) : "",
          shipping_units: json.shipment.shipping_units ? String(json.shipment.shipping_units) : "",
        });
      }
    } catch {
      setState({ ok: false, error: "Unable to load shipment." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [trackingId]);

  useEffect(() => {
    (async () => {
      setConfigLoading(true);
      try {
        const res = await fetch("/api/shipments/config", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setShippingRates(Array.isArray(json.shipping_rates) ? json.shipping_rates : []);
        }
      } finally {
        setConfigLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const units = Number(form.shipping_units || 0);
      const rateValue = Number(form.shipping_rate_value || 0);
      const estimatedUsd =
        Number.isFinite(units) && Number.isFinite(rateValue) && units > 0 && rateValue > 0
          ? units * rateValue
          : null;
      const res = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shipping_rate_id: form.shipping_rate_id || null,
          shipping_type_id: form.shipping_type_id || null,
          shipping_rate_value: form.shipping_rate_value ? Number(form.shipping_rate_value) : null,
          shipping_units: form.shipping_units ? Number(form.shipping_units) : null,
          estimated_shipping_usd: estimatedUsd,
          estimated_shipping_amount: estimatedUsd,
          estimated_shipping_currency: "USD",
        }),
      });
      const json = (await res.json().catch(() => null)) as DetailResponse | null;
      if (json?.ok) {
        await load();
      } else {
        setState(json || { ok: false, error: "Unable to save shipment." });
      }
    } catch {
      setState({ ok: false, error: "Unable to save shipment." });
    } finally {
      setSaving(false);
    }
  }

  async function submitShipment() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "created" }),
      });
      const json = (await res.json().catch(() => null)) as DetailResponse | null;
      if (json?.ok) {
        await load();
      } else {
        setState(json || { ok: false, error: "Unable to submit shipment." });
      }
    } catch {
      setState({ ok: false, error: "Unable to submit shipment." });
    } finally {
      setSubmitting(false);
    }
  }

  async function payEstimate() {
    setPaying(true);
    try {
      const res = await fetch("/api/shipments/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipment.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setState({ ok: false, error: json?.error || "Unable to create shipping invoice." });
        return;
      }
      if (json?.token) {
        window.location.href = `/shipping-quote/${encodeURIComponent(json.token)}`;
      }
    } catch {
      setState({ ok: false, error: "Unable to create shipping invoice." });
    } finally {
      setPaying(false);
    }
  }

  async function addPackage() {
    const payload = {
      title: packageForm.title.trim(),
      quantity: Number(packageForm.quantity || 0),
      supplier_name: packageForm.supplier_name,
      notes: packageForm.notes,
    };
    if (!payload.title) {
      setState({ ok: false, error: "Package name is required." });
      return;
    }
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setState({ ok: false, error: json?.error || "Unable to add package." });
        return;
      }
      setPackageForm({ title: "", quantity: "1", supplier_name: "", notes: "" });
      await load();
    } catch {
      setState({ ok: false, error: "Unable to add package." });
    }
  }

  async function savePackage(packageId: number) {
    try {
      const res = await fetch(
        `/api/shipments/${encodeURIComponent(trackingId)}/packages/${packageId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editingPackage.title,
            quantity: Number(editingPackage.quantity || 0),
            supplier_name: editingPackage.supplier_name,
            notes: editingPackage.notes,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setState({ ok: false, error: json?.error || "Unable to update package." });
        return;
      }
      setEditingPackageId(null);
      await load();
    } catch {
      setState({ ok: false, error: "Unable to update package." });
    }
  }

  async function deletePackage(packageId: number) {
    try {
      const res = await fetch(
        `/api/shipments/${encodeURIComponent(trackingId)}/packages/${packageId}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setState({ ok: false, error: json?.error || "Unable to delete package." });
        return;
      }
      await load();
    } catch {
      setState({ ok: false, error: "Unable to delete package." });
    }
  }

  async function deleteDraftShipment() {
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(trackingId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setState({ ok: false, error: json?.error || "Unable to delete shipment." });
        return;
      }
      window.location.href = "/shipments";
    } catch {
      setState({ ok: false, error: "Unable to delete shipment." });
    }
  }

  const availableRates = useMemo(() => {
    const destId = Number((state && state.ok && state.shipment?.destination_country_id) || 0);
    if (!destId) return [];
    return shippingRates.filter((rate) => Number(rate.country_id || 0) === destId);
  }, [shippingRates, state]);
  const selectedRate = useMemo(
    () => availableRates.find((rate) => rate.id === Number(form.shipping_rate_id || 0)) || null,
    [availableRates, form.shipping_rate_id]
  );
  const computedEstimate = useMemo(() => {
    const units = Number(form.shipping_units || 0);
    const rateValue = Number(form.shipping_rate_value || 0);
    if (!Number.isFinite(units) || !Number.isFinite(rateValue) || units <= 0 || rateValue <= 0) return null;
    return units * rateValue;
  }, [form.shipping_units, form.shipping_rate_value]);

  if (loading) {
    return (
      <div className="px-6 py-10 text-sm text-neutral-500">Loading shipment...</div>
    );
  }

  if (!state || !state.ok) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {state?.error || "Unable to load shipment."}{" "}
          <Link href="/shipments" className="font-semibold text-[var(--agent-blue)]">
            Back to shipments
          </Link>
        </div>
      </div>
    );
  }

  const shipment = state.shipment;
  const events = state.events || [];
  const packages = state.packages || [];

  return (
    <div className="px-6 py-10">
      <div className="mb-6">
        <Link href="/shipments" className="text-sm font-semibold text-neutral-500 hover:text-neutral-700">
          ← Back to shipments
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Tracking ID</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{shipment.public_tracking_id}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Status: <span className="font-semibold">{shipment.status || "created"}</span>
          </p>
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            <div className="font-semibold text-neutral-900">Estimated shipping</div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-600">
              <span>
                Estimated total weight:{" "}
                <span className="font-semibold text-neutral-800">
                  {form.shipping_units ? Number(form.shipping_units).toFixed(2) : "—"}{" "}
                  {form.shipping_rate_unit === "per_cbm" ? "CBM" : "KG"}
                </span>
              </span>
              <span>
                Rate:{" "}
                <span className="font-semibold text-neutral-800">
                  {form.shipping_rate_value ? `$${Number(form.shipping_rate_value).toFixed(2)}` : "—"}{" "}
                  / {form.shipping_rate_unit === "per_cbm" ? "CBM" : "KG"}
                </span>
              </span>
              <span>
                Estimated cost:{" "}
                <span className="font-semibold text-neutral-800">
                  {computedEstimate
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(Number(computedEstimate))
                    : "—"}
                </span>
              </span>
            </div>
          </div>
          {shipment.status === "draft" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-neutral-600">
                Shipping type & rate
                <select
                  value={form.shipping_rate_id || ""}
                  onChange={(e) => {
                    const id = Number(e.target.value || 0);
                    const rate = availableRates.find((r) => r.id === id);
                    setForm((prev) => ({
                      ...prev,
                      shipping_rate_id: id,
                      shipping_type_id: rate?.shipping_type_id || 0,
                      shipping_rate_unit: rate?.rate_unit || "",
                      shipping_rate_value: rate?.rate_value ? String(rate.rate_value) : "",
                    }));
                  }}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
                  disabled={configLoading}
                >
                  <option value="">
                    {configLoading ? "Loading rates..." : "Select shipping type & rate"}
                  </option>
                  {availableRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.shipping_type_name || "Shipping"} ·{" "}
                      {rate.rate_unit === "per_cbm" ? "Per CBM" : "Per KG"} · $
                      {Number(rate.rate_value || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">
                Estimated total {selectedRate?.rate_unit === "per_cbm" ? "CBM" : "weight (KG)"}
                <input
                  value={form.shipping_units}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipping_units: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-neutral-600">
              Origin country
              <input
                value={form.origin_country}
                onChange={(e) => setForm((prev) => ({ ...prev, origin_country: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              Destination country
              <input
                value={form.destination_country}
                onChange={(e) => setForm((prev) => ({ ...prev, destination_country: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              Carrier
              <input
                value={form.carrier}
                onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              LineScout tracking number
              <input
                value={form.carrier_tracking_number}
                onChange={(e) => setForm((prev) => ({ ...prev, carrier_tracking_number: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              ETA (YYYY-MM-DD)
              <input
                value={form.eta_date}
                onChange={(e) => setForm((prev) => ({ ...prev, eta_date: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-neutral-600 md:col-span-2">
              Shipment details
              <textarea
                value={form.shipment_details}
                onChange={(e) => setForm((prev) => ({ ...prev, shipment_details: e.target.value }))}
                className="mt-1 min-h-[96px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:whitespace-nowrap"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {shipment.status === "draft" || shipment.status === "created" ? (
              <>
                <button
                  type="button"
                  onClick={submitShipment}
                  disabled={submitting}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-60 sm:whitespace-nowrap"
                >
                  {submitting ? "Submitting..." : "Submit shipment"}
                </button>
                <button
                  type="button"
                  onClick={payEstimate}
                  disabled={paying}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-60 sm:whitespace-nowrap"
                >
                  {paying ? "Preparing invoice..." : "Pay for shipping"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteShipment(true)}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-600 sm:whitespace-nowrap"
                >
                  Delete draft
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Packages in this shipment</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={packageForm.title}
              onChange={(e) => setPackageForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Package name"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
            <input
              value={packageForm.quantity}
              onChange={(e) => setPackageForm((prev) => ({ ...prev, quantity: e.target.value }))}
              placeholder="Quantity"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
            <input
              value={packageForm.supplier_name}
              onChange={(e) => setPackageForm((prev) => ({ ...prev, supplier_name: e.target.value }))}
              placeholder="Supplier (optional)"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
            <input
              value={packageForm.notes}
              onChange={(e) => setPackageForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={addPackage}
            className="mt-4 inline-flex items-center rounded-2xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700"
          >
            Add package
          </button>

          <div className="mt-5 space-y-3">
            {packages.length ? (
              packages.map((pkg: any) => {
                const isEditing = editingPackageId === pkg.id;
                return (
                  <div key={pkg.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    {isEditing ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={editingPackage.title}
                          onChange={(e) => setEditingPackage((prev) => ({ ...prev, title: e.target.value }))}
                          className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                        />
                        <input
                          value={editingPackage.quantity}
                          onChange={(e) => setEditingPackage((prev) => ({ ...prev, quantity: e.target.value }))}
                          className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                        />
                        <input
                          value={editingPackage.supplier_name}
                          onChange={(e) => setEditingPackage((prev) => ({ ...prev, supplier_name: e.target.value }))}
                          className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                        />
                        <input
                          value={editingPackage.notes}
                          onChange={(e) => setEditingPackage((prev) => ({ ...prev, notes: e.target.value }))}
                          className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                        />
                        <div className="md:col-span-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => savePackage(pkg.id)}
                            className="rounded-2xl bg-[var(--agent-blue)] px-4 py-2 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPackageId(null)}
                            className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">{pkg.title}</div>
                          <div className="text-xs text-neutral-500">
                            Qty: {pkg.quantity} {pkg.supplier_name ? `• ${pkg.supplier_name}` : ""}
                          </div>
                          {pkg.notes ? <div className="text-xs text-neutral-500">{pkg.notes}</div> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPackageId(pkg.id);
                              setEditingPackage({
                                title: pkg.title || "",
                                quantity: String(pkg.quantity || "1"),
                                supplier_name: pkg.supplier_name || "",
                                notes: pkg.notes || "",
                              });
                            }}
                            className="text-xs font-semibold text-neutral-500 hover:text-neutral-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePackageId(pkg.id)}
                            className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-neutral-500">No packages added yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <h2 className="text-sm font-semibold text-neutral-900">Shipment updates</h2>
          <div className="mt-4 space-y-3">
            {events.length ? (
              events.map((event: any, idx: number) => (
                <div key={`${event.status}-${event.event_time}-${idx}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="font-semibold text-neutral-900">{event.status}</div>
                    <div className="text-xs text-neutral-500">
                      {new Date(event.event_time).toLocaleString()}
                    </div>
                  </div>
                  {event.notes ? <p className="mt-1 text-xs text-neutral-600">{event.notes}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No updates yet.</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmDeletePackageId !== null}
        title="Remove package?"
        message="This will delete the package from this shipment."
        confirmLabel="Remove package"
        onClose={() => setConfirmDeletePackageId(null)}
        onConfirm={async () => {
          if (confirmDeletePackageId === null) return;
          const id = confirmDeletePackageId;
          setConfirmDeletePackageId(null);
          await deletePackage(id);
        }}
      />
      <ConfirmModal
        open={confirmDeleteShipment}
        title="Delete draft shipment?"
        message="This will remove the draft shipment and its packages."
        confirmLabel="Delete draft"
        tone="danger"
        onClose={() => setConfirmDeleteShipment(false)}
        onConfirm={async () => {
          setConfirmDeleteShipment(false);
          await deleteDraftShipment();
        }}
      />
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  tone = "primary",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const confirmClass =
    tone === "danger"
      ? "btn btn-primary bg-rose-600 hover:bg-rose-700"
      : "btn btn-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        aria-label="Close modal"
        className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-2xl">
        <div className="p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
            LineScout
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900">{title}</h2>
          <p className="mt-2 text-sm text-neutral-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(45,52,97,0.12)] bg-neutral-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${confirmClass} px-4 py-2 text-xs`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
