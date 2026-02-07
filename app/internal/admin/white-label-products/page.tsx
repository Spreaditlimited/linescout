"use client";

import { useEffect, useMemo, useState } from "react";

type WhiteLabelProduct = {
  id: number;
  product_name: string;
  category: string;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_1000: number | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  landed_ngn_per_unit_low?: number | null;
  landed_ngn_per_unit_high?: number | null;
  landed_ngn_total_1000_low?: number | null;
  landed_ngn_total_1000_high?: number | null;
};

type EditState = {
  product_name: string;
  category: string;
  short_desc: string;
  why_sells: string;
  regulatory_note: string;
  mockup_prompt: string;
  image_url: string;
  fob_low_usd: string;
  fob_high_usd: string;
  cbm_per_1000: string;
  is_active: boolean;
  sort_order: string;
};

const emptyForm: EditState = {
  product_name: "",
  category: "",
  short_desc: "",
  why_sells: "",
  regulatory_note: "",
  mockup_prompt: "",
  image_url: "",
  fob_low_usd: "",
  fob_high_usd: "",
  cbm_per_1000: "",
  is_active: true,
  sort_order: "0",
};

export default function WhiteLabelProductsPage() {
  const [items, setItems] = useState<WhiteLabelProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [activeFilter, setActiveFilter] = useState("1");

  const [form, setForm] = useState<EditState>(emptyForm);
  const [savingNew, setSavingNew] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
      if (category.trim()) qs.set("category", category.trim());
      if (activeFilter === "0" || activeFilter === "1") qs.set("active", activeFilter);

      const res = await fetch(`/api/internal/admin/white-label-products?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load products");
      }
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, activeFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  function startEdit(item: WhiteLabelProduct) {
    setExpandedId(item.id);
    setEdits((prev) => ({
      ...prev,
      [item.id]: {
        product_name: item.product_name || "",
        category: item.category || "",
        short_desc: item.short_desc || "",
        why_sells: item.why_sells || "",
        regulatory_note: item.regulatory_note || "",
        mockup_prompt: item.mockup_prompt || "",
        image_url: item.image_url || "",
        fob_low_usd: item.fob_low_usd != null ? String(item.fob_low_usd) : "",
        fob_high_usd: item.fob_high_usd != null ? String(item.fob_high_usd) : "",
        cbm_per_1000: item.cbm_per_1000 != null ? String(item.cbm_per_1000) : "",
        is_active: item.is_active === 1,
        sort_order: String(item.sort_order ?? 0),
      },
    }));
  }

  function updateEdit(id: number, key: keyof EditState, value: any) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyForm), [key]: value },
    }));
  }

  async function saveEdit(id: number) {
    const state = edits[id];
    if (!state) return;
    if (!state.product_name.trim() || !state.category.trim()) {
      setErr("Product name and category are required.");
      return;
    }
    setSavingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/white-label-products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: state.product_name,
          category: state.category,
          short_desc: state.short_desc,
          why_sells: state.why_sells,
          regulatory_note: state.regulatory_note,
          mockup_prompt: state.mockup_prompt,
          image_url: state.image_url,
          fob_low_usd: state.fob_low_usd,
          fob_high_usd: state.fob_high_usd,
          cbm_per_1000: state.cbm_per_1000,
          is_active: state.is_active,
          sort_order: state.sort_order,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update");
      }
      await load();
      setExpandedId(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to update");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm("Delete this product?")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/white-label-products/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete");
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete");
    }
  }

  async function createProduct() {
    if (savingNew) return;
    setErr(null);
    if (!form.product_name.trim() || !form.category.trim()) {
      setErr("Product name and category are required.");
      return;
    }
    setSavingNew(true);
    try {
      const res = await fetch("/api/internal/admin/white-label-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: form.product_name,
          category: form.category,
          short_desc: form.short_desc,
          why_sells: form.why_sells,
          regulatory_note: form.regulatory_note,
          mockup_prompt: form.mockup_prompt,
          image_url: form.image_url,
          fob_low_usd: form.fob_low_usd,
          fob_high_usd: form.fob_high_usd,
          cbm_per_1000: form.cbm_per_1000,
          is_active: form.is_active,
          sort_order: form.sort_order,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create");
      }
      setForm(emptyForm);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create");
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-neutral-100">
      <div>
        <h1 className="text-2xl font-semibold">White Label Products</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Manage catalog items and optimistic landed cost ranges used in the mobile app.
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Add new product</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Product name"
            value={form.product_name}
            onChange={(e) => setForm((s) => ({ ...s, product_name: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="FOB low (USD)"
            value={form.fob_low_usd}
            onChange={(e) => setForm((s) => ({ ...s, fob_low_usd: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="FOB high (USD)"
            value={form.fob_high_usd}
            onChange={(e) => setForm((s) => ({ ...s, fob_high_usd: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="CBM per 1000"
            value={form.cbm_per_1000}
            onChange={(e) => setForm((s) => ({ ...s, cbm_per_1000: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Sort order"
            value={form.sort_order}
            onChange={(e) => setForm((s) => ({ ...s, sort_order: e.target.value }))}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Short description"
            value={form.short_desc}
            onChange={(e) => setForm((s) => ({ ...s, short_desc: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Why it sells in Nigeria"
            value={form.why_sells}
            onChange={(e) => setForm((s) => ({ ...s, why_sells: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Regulatory note"
            value={form.regulatory_note}
            onChange={(e) => setForm((s) => ({ ...s, regulatory_note: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Mockup prompt"
            value={form.mockup_prompt}
            onChange={(e) => setForm((s) => ({ ...s, mockup_prompt: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) => setForm((s) => ({ ...s, image_url: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
            />
            Active
          </label>
          <button
            onClick={createProduct}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            disabled={savingNew}
          >
            {savingNew ? "Saving..." : "Add product"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
          >
            <option value="1">Active only</option>
            <option value="0">Inactive only</option>
            <option value="">All</option>
          </select>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-neutral-400">Loading...</div>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((item) => {
              const open = expandedId === item.id;
              const edit = edits[item.id];
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.product_name}</p>
                      <p className="text-xs text-neutral-400">{item.category}</p>
                      <p className="text-xs text-neutral-500">
                        ₦{Math.round(item.landed_ngn_per_unit_low || 0).toLocaleString()}–₦
                        {Math.round(item.landed_ngn_per_unit_high || 0).toLocaleString()} per unit
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          item.is_active ? "bg-emerald-500/20 text-emerald-200" : "bg-neutral-700 text-neutral-300"
                        }`}
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                      <button
                        className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white"
                        onClick={() => (open ? setExpandedId(null) : startEdit(item))}
                      >
                        {open ? "Close" : "Edit"}
                      </button>
                      <button
                        className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200"
                        onClick={() => deleteItem(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {open && edit ? (
                    <div className="border-t border-white/10 px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.product_name}
                          onChange={(e) => updateEdit(item.id, "product_name", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.category}
                          onChange={(e) => updateEdit(item.id, "category", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.fob_low_usd}
                          onChange={(e) => updateEdit(item.id, "fob_low_usd", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.fob_high_usd}
                          onChange={(e) => updateEdit(item.id, "fob_high_usd", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.cbm_per_1000}
                          onChange={(e) => updateEdit(item.id, "cbm_per_1000", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.sort_order}
                          onChange={(e) => updateEdit(item.id, "sort_order", e.target.value)}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.short_desc}
                          onChange={(e) => updateEdit(item.id, "short_desc", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.why_sells}
                          onChange={(e) => updateEdit(item.id, "why_sells", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.regulatory_note}
                          onChange={(e) => updateEdit(item.id, "regulatory_note", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.mockup_prompt}
                          onChange={(e) => updateEdit(item.id, "mockup_prompt", e.target.value)}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <input
                          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.image_url}
                          onChange={(e) => updateEdit(item.id, "image_url", e.target.value)}
                        />
                        <label className="flex items-center gap-2 text-sm text-neutral-300">
                          <input
                            type="checkbox"
                            checked={edit.is_active}
                            onChange={(e) => updateEdit(item.id, "is_active", e.target.checked)}
                          />
                          Active
                        </label>
                        <button
                          onClick={() => saveEdit(item.id)}
                          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
                          disabled={savingId === item.id}
                        >
                          {savingId === item.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
