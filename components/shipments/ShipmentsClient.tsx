"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ShipmentRow = {
  public_tracking_id: string;
  status: string | null;
  origin_country: string | null;
  destination_country: string | null;
  carrier: string | null;
  carrier_tracking_number: string | null;
  tracking_provider: string | null;
  eta_date: string | null;
  last_event_at: string | null;
  created_at: string;
};

type CountryRow = {
  id: number;
  name: string;
  iso2: string | null;
  default_currency_id: number | null;
  settlement_currency_code: string | null;
  payment_provider: string | null;
};

type ShippingRateRow = {
  id: number;
  shipping_type_id: number | null;
  shipping_type_name: string | null;
  rate_value: number | null;
  rate_unit: "per_kg" | "per_cbm" | string;
  currency: string | null;
  country_id: number | null;
};

type FxRateRow = {
  base_currency_code: string;
  quote_currency_code: string;
  rate: number;
};

type ConfigResponse =
  | {
      ok: true;
      countries: CountryRow[];
      shipping_rates: ShippingRateRow[];
      fx_rates: FxRateRow[];
      profile: {
        country_id: number | null;
        country_iso2: string;
        display_currency_code: string;
        payment_provider: string;
      };
    }
  | { ok: false; error: string };

type ProfileConfig = {
  country_id: number | null;
  country_iso2: string;
  display_currency_code: string;
  payment_provider: string;
};

const DEFAULT_ORIGIN = "China";
const DEFAULT_CARRIER = "Sure Imports";

function findFxRate(rates: FxRateRow[], baseRaw: string, quoteRaw: string) {
  const base = String(baseRaw || "").toUpperCase();
  const quote = String(quoteRaw || "").toUpperCase();
  if (!base || !quote) return null;
  if (base === quote) return 1;
  const match = rates.find(
    (r) =>
      String(r.base_currency_code || "").toUpperCase() === base &&
      String(r.quote_currency_code || "").toUpperCase() === quote
  );
  const rate = Number(match?.rate || 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "";
  const code = String(currency || "").toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

export default function ShipmentsClient() {
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRateRow[]>([]);
  const [fxRates, setFxRates] = useState<FxRateRow[]>([]);
  const [profile, setProfile] = useState<ProfileConfig>({
    country_id: null,
    country_iso2: "",
    display_currency_code: "",
    payment_provider: "",
  });
  const [form, setForm] = useState({
    origin_country: DEFAULT_ORIGIN,
    destination_country: "",
    destination_country_id: 0,
    carrier: DEFAULT_CARRIER,
    carrier_tracking_number: "",
    shipment_details: "",
    shipping_rate_id: 0,
    shipping_type_id: 0,
    shipping_rate_unit: "",
    shipping_rate_value: 0,
    shipping_units: "",
  });
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdShipmentId, setCreatedShipmentId] = useState<number | null>(null);
  const [createdStatus, setCreatedStatus] = useState<"draft" | "created" | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [packageForm, setPackageForm] = useState({
    title: "",
    quantity: "1",
    supplier_name: "",
    notes: "",
  });
  const [packagesDraft, setPackagesDraft] = useState<
    { title: string; quantity: number; supplier_name?: string; notes?: string }[]
  >([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shipments", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to load shipments.");
      setShipments(Array.isArray(json.shipments) ? json.shipments : []);
    } catch (e: any) {
      setError(e?.message || "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig() {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/shipments/config", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ConfigResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Unable to load shipping config.");
      setCountries(Array.isArray(json.countries) ? json.countries : []);
      setShippingRates(Array.isArray(json.shipping_rates) ? json.shipping_rates : []);
      setFxRates(Array.isArray(json.fx_rates) ? json.fx_rates : []);
      setProfile(json.profile || {});

      if (json.profile?.country_id) {
        const country = (json.countries || []).find((c) => c.id === json.profile.country_id);
        if (country) {
          setForm((prev) => ({
            ...prev,
            destination_country_id: country.id,
            destination_country: country.name,
          }));
        }
      }
    } catch (e: any) {
      setError(e?.message || "Unable to load shipping config.");
    } finally {
      setConfigLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadConfig();
  }, []);

  const selectedCountry = countries.find((c) => c.id === Number(form.destination_country_id || 0)) || null;
  const availableRates = shippingRates.filter(
    (r) => Number(r.country_id || 0) === Number(form.destination_country_id || 0)
  );
  const selectedRate =
    availableRates.find((r) => r.id === Number(form.shipping_rate_id || 0)) || null;
  const units = Number(form.shipping_units || 0);
  const displayCurrency = "USD";

  const estimate = useMemo(() => {
    if (!selectedRate) return null;
    if (!Number.isFinite(units) || units <= 0) return null;
    const rateValue = Number(selectedRate.rate_value || 0);
    if (!Number.isFinite(rateValue) || rateValue <= 0) return null;
    const rateCurrency = String(selectedRate.currency || "USD").toUpperCase();
    const estimatedInRateCurrency = rateValue * units;
    const toDisplay = findFxRate(fxRates, rateCurrency, displayCurrency);
    const displayAmount = toDisplay ? estimatedInRateCurrency * toDisplay : null;
    const toUsd = rateCurrency === "USD" ? 1 : findFxRate(fxRates, rateCurrency, "USD");
    const usdAmount = toUsd ? estimatedInRateCurrency * toUsd : null;
    return {
      rateCurrency,
      estimatedInRateCurrency,
      displayAmount,
      usdAmount,
    };
  }, [selectedRate, units, fxRates, displayCurrency]);

  async function submit(status: "draft" | "created") {
    setCreating(true);
    setCreatedId(null);
    setCreatedShipmentId(null);
    setCreatedStatus(null);
    setError(null);
    try {
      const payload = {
        origin_country: form.origin_country,
        destination_country: form.destination_country,
        destination_country_id: form.destination_country_id || null,
        carrier: form.carrier,
        carrier_tracking_number: form.carrier_tracking_number,
        shipment_details: form.shipment_details,
        shipping_rate_id: form.shipping_rate_id || null,
        shipping_type_id: form.shipping_type_id || null,
        shipping_rate_unit: form.shipping_rate_unit,
        shipping_rate_value: form.shipping_rate_value || null,
        shipping_units: form.shipping_units ? Number(form.shipping_units) : null,
        estimated_shipping_usd: estimate?.usdAmount ?? null,
        estimated_shipping_amount: estimate?.usdAmount ?? null,
        estimated_shipping_currency: "USD",
        status,
        tracking_provider: "manual",
        packages: packagesDraft,
      };
      if (status === "created" && (!payload.origin_country || !payload.destination_country)) {
        throw new Error("Origin and destination are required.");
      }
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to create shipment.");
      setCreatedId(json.tracking_id || null);
      setCreatedShipmentId(Number(json.shipment_id || 0) || null);
      setCreatedStatus(status);
      if (json.tracking_id && packagesDraft.length) {
        const results = await Promise.allSettled(
          packagesDraft.map((pkg) =>
            fetch(`/api/shipments/${encodeURIComponent(json.tracking_id)}/packages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(pkg),
            })
          )
        );
        const failures = results.filter((res) => res.status === "rejected").length;
        if (failures) {
          setError("Shipment created, but some packages failed to save. Please try again.");
        } else {
          const bad = await Promise.all(
            results.map(async (res) => {
              if (res.status !== "fulfilled") return true;
              const ok = res.value.ok;
              if (!ok) return true;
              const data = await res.value.json().catch(() => null);
              return !data?.ok;
            })
          );
          if (bad.some(Boolean)) {
            setError("Shipment created, but some packages failed to save. Please try again.");
          } else {
            setPackagesDraft([]);
            setPackageForm({ title: "", quantity: "1", supplier_name: "", notes: "" });
          }
        }
      }
      setForm({
        origin_country: DEFAULT_ORIGIN,
        destination_country: selectedCountry?.name || "",
        destination_country_id: selectedCountry?.id || 0,
        carrier: DEFAULT_CARRIER,
        carrier_tracking_number: "",
        shipment_details: "",
        shipping_rate_id: 0,
        shipping_type_id: 0,
        shipping_rate_unit: "",
        shipping_rate_value: 0,
        shipping_units: "",
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Unable to create shipment.");
    } finally {
      setCreating(false);
    }
  }

  function addDraftPackage() {
    const title = packageForm.title.trim();
    const quantity = Number(packageForm.quantity || 0);
    if (!title || !Number.isFinite(quantity) || quantity <= 0) return;
    setPackagesDraft((prev) => [
      ...prev,
      {
        title,
        quantity,
        supplier_name: packageForm.supplier_name.trim() || undefined,
        notes: packageForm.notes.trim() || undefined,
      },
    ]);
    setPackageForm({ title: "", quantity: "1", supplier_name: "", notes: "" });
  }

  return (
    <div className="px-6 py-10">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Shipments</p>
        <h1 className="text-2xl font-semibold text-neutral-900">Create and Manage Shipments</h1>
        <p className="text-sm text-neutral-600">
          Create a LineScout tracking ID for shipping‑only service or view existing project shipments.
        </p>
      </div>

      <div className="mt-6 rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-sm font-semibold text-neutral-900">Create shipping‑only tracking</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-600">
            Origin country
            <input
              value={form.origin_country}
              readOnly
              placeholder="China"
              className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-600">
            Destination country
            <select
              value={form.destination_country_id || ""}
              onChange={(e) => {
                const id = Number(e.target.value || 0);
                const country = countries.find((c) => c.id === id);
                setForm((prev) => ({
                  ...prev,
                  destination_country_id: id,
                  destination_country: country?.name || "",
                  shipping_rate_id: 0,
                  shipping_type_id: 0,
                  shipping_rate_unit: "",
                  shipping_rate_value: 0,
                  shipping_units: "",
                }));
              }}
              className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              disabled={configLoading}
            >
              <option value="">{configLoading ? "Loading countries..." : "Select destination"}</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-600">
            LineScout tracking number
            <input
              value={createdId ? createdId : "Auto-generated on creation"}
              readOnly
              className="mt-1 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-600">
            Select shipping type
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
                  shipping_rate_value: Number(rate?.rate_value || 0),
                }));
              }}
              className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              disabled={!form.destination_country_id || configLoading}
            >
              <option value="">
                {form.destination_country_id ? "Select shipping type & rate" : "Select destination to see rates"}
              </option>
              {availableRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.shipping_type_name || "Shipping"} · {rate.rate_unit === "per_cbm" ? "Per CBM" : "Per KG"} ·{" "}
                  {formatMoney(Number(rate.rate_value || 0), rate.currency || "USD")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-600">
            Estimated {selectedRate?.rate_unit === "per_cbm" ? "CBM" : "weight (KG)"}
            <input
              value={form.shipping_units}
              onChange={(e) => setForm((prev) => ({ ...prev, shipping_units: e.target.value }))}
              placeholder={
                selectedRate?.rate_unit === "per_cbm"
                  ? "Estimated CBM"
                  : selectedRate?.shipping_type_name?.toLowerCase().includes("sea")
                    ? "Estimated volumetric weight (KG)"
                    : "Estimated weight (KG)"
              }
              className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
              disabled={!selectedRate}
            />
          </label>
          <label className="text-xs font-semibold text-neutral-600 md:col-span-2">
            Shipment details
            <textarea
              value={form.shipment_details}
              onChange={(e) => setForm((prev) => ({ ...prev, shipment_details: e.target.value }))}
              placeholder="What are you shipping?"
              className="mt-1 min-h-[96px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
          <div className="text-sm font-semibold text-neutral-900">Packages in this shipment</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
            onClick={addDraftPackage}
            className="mt-3 inline-flex items-center rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700"
          >
            Add package
          </button>
          {packagesDraft.length ? (
            <div className="mt-3 space-y-2">
              {packagesDraft.map((pkg, idx) => (
                <div key={`${pkg.title}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                  <div>
                    <span className="font-semibold text-neutral-900">{pkg.title}</span> · Qty {pkg.quantity}
                    {pkg.supplier_name ? ` · ${pkg.supplier_name}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPackagesDraft((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-neutral-500">No packages added yet.</div>
          )}
        </div>
        {estimate ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Estimated shipping cost:{" "}
            <span className="font-semibold">
              {estimate.usdAmount
                ? formatMoney(estimate.usdAmount, "USD")
                : formatMoney(estimate.estimatedInRateCurrency, estimate.rateCurrency)}
            </span>{" "}
            <span className="text-amber-700">(estimate based on your inputs)</span>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => submit("created")}
            disabled={
              creating ||
              !form.origin_country ||
              !form.destination_country ||
              !form.destination_country_id ||
              !form.shipping_rate_id ||
              !form.shipping_units
            }
            className="inline-flex items-center rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Shipment"}
          </button>
          <button
            type="button"
            onClick={() => submit("draft")}
            disabled={creating || !form.origin_country}
            className="inline-flex items-center rounded-2xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
          >
            {creating ? "Saving..." : "Save draft"}
          </button>
          {createdId ? (
            <Link href={`/shipments/${encodeURIComponent(createdId)}`} className="text-sm font-semibold text-[var(--agent-blue)]">
              View tracking {createdId}
            </Link>
          ) : null}
          {createdShipmentId && createdStatus === "created" ? (
            <PayNowButton
              shipmentId={createdShipmentId}
              paymentProvider={profile?.payment_provider || ""}
            />
          ) : null}
        </div>
        {error ? <div className="mt-3 text-sm text-amber-700">{error}</div> : null}
        {createdId && createdStatus === "created" ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
            <p className="font-semibold text-neutral-900">Next steps</p>
            <p className="mt-2">
              After creating a shipment, please ensure to send your shipment to our China office:
            </p>
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800">
              <div>广州市白云区机场路111号建发广场3FB3-1.</div>
              <div className="mt-1">+86 1957 6837 849</div>
            </div>
            <p className="mt-3">
              Instruct your supplier to write your LineScout Tracking Number on the shipment. You are responsible for
              making sure that your shipment gets to our office. We will notify you once we take delivery.
            </p>
            <p className="mt-3">
              You can pay an estimated shipping cost now, or submit and pay later after we confirm the actual weight or
              CBM.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Track existing shipments</h2>
          <button
            type="button"
            onClick={load}
            className="text-xs font-semibold text-neutral-500 hover:text-neutral-700"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Enter LineScout tracking ID"
            className="min-w-[220px] flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
          />
          <Link
            href={lookupId ? `/shipments/${encodeURIComponent(lookupId.trim())}` : "#"}
            className={`inline-flex items-center rounded-2xl px-5 py-3 text-sm font-semibold ${
              lookupId.trim()
                ? "bg-[var(--agent-blue)] text-white"
                : "cursor-not-allowed bg-neutral-200 text-neutral-400"
            }`}
            aria-disabled={!lookupId.trim()}
            onClick={(e) => {
              if (!lookupId.trim()) e.preventDefault();
            }}
          >
            Track shipment
          </Link>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading shipments...</p>
        ) : shipments.length ? (
          <div className="mt-4 space-y-3">
            {shipments.map((s) => (
              <Link
                key={s.public_tracking_id}
                href={`/shipments/${encodeURIComponent(s.public_tracking_id)}`}
                className="block rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      {s.public_tracking_id}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-900">
                      {s.origin_country || "Origin"} → {s.destination_country || "Destination"}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-neutral-600">{s.status || "created"}</div>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {s.carrier ? `${s.carrier} • ` : ""}{s.carrier_tracking_number || "LineScout tracking"}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">No shipments yet.</p>
        )}
      </div>
    </div>
  );
}

function PayNowButton({ shipmentId, paymentProvider }: { shipmentId: number; paymentProvider: string }) {
  const [loading, setLoading] = useState(false);
  async function handlePay() {
    setLoading(true);
    try {
      const res = await fetch("/api/shipments/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipmentId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to create shipping invoice.");
      }
      if (json?.token) {
        window.location.href = `/shipping-quote/${encodeURIComponent(json.token)}`;
      }
    } catch (e: any) {
      alert(e?.message || "Unable to create shipping invoice.");
    } finally {
      setLoading(false);
    }
  }

  const providerLabel =
    String(paymentProvider || "").toLowerCase() === "paystack" ? "Pay with Paystack" : "Pay with PayPal";

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={loading}
      className="inline-flex items-center rounded-2xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm disabled:opacity-60"
    >
      {loading ? "Preparing invoice..." : providerLabel}
    </button>
  );
}
