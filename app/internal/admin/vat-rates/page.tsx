"use client";

import { useEffect, useState } from "react";

type Country = { id: number; name: string; iso2: string; iso3?: string | null };
type VatRate = { country_id: number; rate_percent: number; is_active: number };

export default function AdminVatRatesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [rates, setRates] = useState<Record<number, { rate: string; active: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/internal/admin/vat-rates", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load VAT rates");
      const countryList = Array.isArray(json.countries) ? json.countries : [];
      const rateList = Array.isArray(json.rates) ? json.rates : [];
      const nextRates: Record<number, { rate: string; active: boolean }> = {};
      countryList.forEach((c: Country) => {
        const match = rateList.find((r: VatRate) => Number(r.country_id) === Number(c.id));
        nextRates[c.id] = {
          rate: Number(match?.rate_percent || 0).toFixed(2),
          active: match ? match.is_active === 1 : false,
        };
      });
      setCountries(countryList);
      setRates(nextRates);
    } catch (e: any) {
      setErr(e?.message || "Failed to load VAT rates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(countryId: number) {
    setErr(null);
    setMsg(null);
    try {
      const row = rates[countryId];
      const res = await fetch("/api/internal/admin/vat-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country_id: countryId,
          rate_percent: Number(row?.rate || 0),
          is_active: row?.active ? 1 : 0,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save VAT rate");
      setMsg("VAT rates updated.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save VAT rate");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 text-sm text-neutral-200">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">VAT rates</h2>
        <p className="text-sm text-neutral-400">Set VAT percentage per country. Used on service fees.</p>

        <div className="mt-4 space-y-3">
          {countries.map((c) => {
            const row = rates[c.id];
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-neutral-100">
                    {c.name} ({c.iso2})
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={row?.active || false}
                      onChange={(e) =>
                        setRates((prev) => ({
                          ...prev,
                          [c.id]: { rate: prev[c.id]?.rate || "0.00", active: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                    />
                    Active
                  </label>
                  <input
                    value={row?.rate || "0.00"}
                    onChange={(e) =>
                      setRates((prev) => ({
                        ...prev,
                        [c.id]: { rate: e.target.value, active: prev[c.id]?.active || false },
                      }))
                    }
                    className="w-28 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => save(c.id)}
                    className="rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {err && <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div>}
        {msg && <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{msg}</div>}
      </div>
    </div>
  );
}
