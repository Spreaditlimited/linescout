"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../../_components/SearchableSelect";

type Currency = {
  id: number;
  code: string;
  symbol?: string | null;
};

type Addon = {
  id: number;
  title: string;
  route_types_json: string | null;
  country_ids_json?: string | null;
  is_active: number;
};

type Price = {
  addon_id: number;
  currency_code: string;
  amount: number;
};

type DraftPrice = {
  currency_code: string;
  amount: string;
};

type DraftAddon = {
  id?: number;
  title: string;
  is_active: boolean;
  route_types: string[];
  country_ids: number[];
  prices: DraftPrice[];
};

const ROUTES = [
  { value: "machine_sourcing", label: "Machine Sourcing" },
  { value: "simple_sourcing", label: "Simple Sourcing" },
  { value: "white_label", label: "White Label" },
];

export default function AdminQuoteAddonsPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [items, setItems] = useState<Addon[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [countries, setCountries] = useState<{ id: number; name: string; iso2?: string | null }[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftAddon>>({});
  const [newAddon, setNewAddon] = useState<DraftAddon>({
    title: "",
    is_active: true,
    route_types: [],
    country_ids: [],
    prices: [],
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const currencyOptions = useMemo(
    () =>
      currencies.map((c) => ({
        value: c.code,
        label: c.code,
      })),
    [currencies]
  );

  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        value: String(c.id),
        label: c.name,
      })),
    [countries]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/internal/admin/quote-addons", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load add-ons");
      setCurrencies(Array.isArray(json.currencies) ? json.currencies : []);
      setCountries(Array.isArray(json.countries) ? json.countries : []);
      setItems(Array.isArray(json.addons) ? json.addons : []);
      setPrices(Array.isArray(json.prices) ? json.prices : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load add-ons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const nextDrafts: Record<number, DraftAddon> = {};
    items.forEach((addon) => {
      let routes: string[] = [];
      if (addon.route_types_json) {
        try {
          const parsed = JSON.parse(addon.route_types_json);
          if (Array.isArray(parsed)) routes = parsed.map((r: any) => String(r || ""));
        } catch {
          routes = [];
        }
      }
      let countryIds: number[] = [];
      if (addon.country_ids_json) {
        try {
          const parsed = JSON.parse(addon.country_ids_json);
          if (Array.isArray(parsed)) {
            countryIds = parsed.map((c: any) => Number(c)).filter((c: number) => Number.isFinite(c) && c > 0);
          }
        } catch {
          countryIds = [];
        }
      }
      const addonPrices = prices
        .filter((p) => Number(p.addon_id) === Number(addon.id))
        .map((p) => ({ currency_code: p.currency_code, amount: Number(p.amount || 0).toFixed(2) }));
      nextDrafts[addon.id] = {
        id: addon.id,
        title: addon.title,
        is_active: addon.is_active === 1,
        route_types: routes,
        country_ids: countryIds,
        prices: addonPrices,
      };
    });
    setDrafts(nextDrafts);
  }, [items, prices]);

  async function saveAddon(draft: DraftAddon) {
    setErr(null);
    setMsg(null);
    try {
      const payload = {
        id: draft.id,
        title: draft.title.trim(),
        is_active: draft.is_active,
        route_types: draft.route_types,
        country_ids: draft.country_ids,
        prices: draft.prices.map((p) => ({
          currency_code: p.currency_code,
          amount: Number(p.amount || 0),
        })),
      };
      const res = await fetch("/api/internal/admin/quote-addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save add-on");
      setMsg("Add-on saved.");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save add-on");
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
        <h2 className="text-lg font-semibold text-neutral-100">Quote add-ons</h2>
        <p className="text-sm text-neutral-400">
          Define additional cost line items per route type and currency. New quotes will inherit these.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={newAddon.title}
            onChange={(e) => setNewAddon((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Add-on title"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          />
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
            <div className="text-xs text-neutral-400">Route types</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROUTES.map((r) => {
                const active = newAddon.route_types.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() =>
                      setNewAddon((prev) => ({
                        ...prev,
                        route_types: active
                          ? prev.route_types.filter((t) => t !== r.value)
                          : [...prev.route_types, r.value],
                      }))
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      active
                        ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
            <div className="text-xs text-neutral-400">Countries</div>
            <div className="mt-2 grid gap-2">
              <SearchableSelect
                value=""
                onChange={(value) =>
                  setNewAddon((prev) => {
                    const id = Number(value);
                    if (!id || prev.country_ids.includes(id)) return prev;
                    return { ...prev, country_ids: [...prev.country_ids, id] };
                  })
                }
                options={countryOptions}
                placeholder="Add country"
                variant="dark"
              />
              <div className="flex flex-wrap gap-2">
                {newAddon.country_ids.map((id) => {
                  const name = countries.find((c) => c.id === id)?.name || `Country ${id}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setNewAddon((prev) => ({
                          ...prev,
                          country_ids: prev.country_ids.filter((c) => c !== id),
                        }))
                      }
                      className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:border-neutral-500"
                    >
                      {name} ×
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-neutral-500">Leave empty to apply to all countries.</div>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
            <div className="text-xs text-neutral-400">Price</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <SearchableSelect
                value={newAddon.prices[0]?.currency_code || ""}
                onChange={(value) =>
                  setNewAddon((prev) => ({
                    ...prev,
                    prices: [{ currency_code: value, amount: prev.prices[0]?.amount || "0.00" }],
                  }))
                }
                options={currencyOptions}
                placeholder="Currency"
                variant="dark"
              />
              <input
                value={newAddon.prices[0]?.amount || ""}
                onChange={(e) =>
                  setNewAddon((prev) => ({
                    ...prev,
                    prices: [{ currency_code: prev.prices[0]?.currency_code || "", amount: e.target.value }],
                  }))
                }
                placeholder="Amount"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            await saveAddon(newAddon);
            setNewAddon({ title: "", is_active: true, route_types: [], country_ids: [], prices: [] });
          }}
          className="mt-3 rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
        >
          Create add-on
        </button>

        {err && <div className="mt-3 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div>}
        {msg && <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">{msg}</div>}
      </div>

      {items.map((addon) => {
        const draft = drafts[addon.id];
        if (!draft) return null;
        return (
          <div key={addon.id} className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">#{addon.id} {draft.title}</div>
                <div className="text-xs text-neutral-500">Add-on</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [addon.id]: { ...prev[addon.id], is_active: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                />
                Active
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                value={draft.title}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [addon.id]: { ...prev[addon.id], title: e.target.value } }))
                }
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
                <div className="text-xs text-neutral-400">Route types</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROUTES.map((r) => {
                    const active = draft.route_types.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [addon.id]: {
                              ...prev[addon.id],
                              route_types: active
                                ? prev[addon.id].route_types.filter((t) => t !== r.value)
                                : [...prev[addon.id].route_types, r.value],
                            },
                          }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          active
                            ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                            : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
                <div className="text-xs text-neutral-400">Countries</div>
                <div className="mt-2 grid gap-2">
                  <SearchableSelect
                    value=""
                    onChange={(value) =>
                      setDrafts((prev) => {
                        const id = Number(value);
                        if (!id || prev[addon.id].country_ids.includes(id)) return prev;
                        return { ...prev, [addon.id]: { ...prev[addon.id], country_ids: [...prev[addon.id].country_ids, id] } };
                      })
                    }
                    options={countryOptions}
                    placeholder="Add country"
                    variant="dark"
                  />
                  <div className="flex flex-wrap gap-2">
                    {draft.country_ids.map((id) => {
                      const name = countries.find((c) => c.id === id)?.name || `Country ${id}`;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() =>
                            setDrafts((prev) => ({
                              ...prev,
                              [addon.id]: {
                                ...prev[addon.id],
                                country_ids: prev[addon.id].country_ids.filter((c) => c !== id),
                              },
                            }))
                          }
                          className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:border-neutral-500"
                        >
                          {name} ×
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-neutral-500">Leave empty to apply to all countries.</div>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100">
                <div className="text-xs text-neutral-400">Prices</div>
                <div className="mt-2 space-y-2">
                  {draft.prices.map((p, idx) => (
                    <div key={`${p.currency_code}-${idx}`} className="grid gap-2 md:grid-cols-2">
                      <SearchableSelect
                        value={p.currency_code}
                        onChange={(value) =>
                          setDrafts((prev) => {
                            const nextPrices = [...prev[addon.id].prices];
                            nextPrices[idx] = { ...nextPrices[idx], currency_code: value };
                            return { ...prev, [addon.id]: { ...prev[addon.id], prices: nextPrices } };
                          })
                        }
                        options={currencyOptions}
                        placeholder="Currency"
                        variant="dark"
                      />
                      <input
                        value={p.amount}
                        onChange={(e) =>
                          setDrafts((prev) => {
                            const nextPrices = [...prev[addon.id].prices];
                            nextPrices[idx] = { ...nextPrices[idx], amount: e.target.value };
                            return { ...prev, [addon.id]: { ...prev[addon.id], prices: nextPrices } };
                          })
                        }
                        className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) => ({
                        ...prev,
                        [addon.id]: {
                          ...prev[addon.id],
                          prices: [...prev[addon.id].prices, { currency_code: "", amount: "0.00" }],
                        },
                      }))
                    }
                    className="text-xs text-neutral-300 hover:text-neutral-100"
                  >
                    + Add price
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => saveAddon(draft)}
              className="mt-3 rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
            >
              Save changes
            </button>
          </div>
        );
      })}
    </div>
  );
}
