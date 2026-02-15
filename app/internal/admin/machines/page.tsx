"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../../_components/SearchableSelect";

type Machine = {
  id: number;
  machine_name: string;
  category: string;
  processing_stage: string | null;
  capacity_range: string | null;
  power_requirement: string | null;
  short_desc: string | null;
  why_sells: string | null;
  regulatory_note: string | null;
  mockup_prompt: string | null;
  image_url: string | null;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  business_summary: string | null;
  market_notes: string | null;
  sourcing_notes: string | null;
  fob_low_usd: number | null;
  fob_high_usd: number | null;
  cbm_per_unit: number | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  view_count?: number | null;
  landed_ngn_low?: number | null;
  landed_ngn_high?: number | null;
  freight_ngn?: number | null;
};

type EditState = {
  machine_name: string;
  category: string;
  processing_stage: string;
  capacity_range: string;
  power_requirement: string;
  short_desc: string;
  why_sells: string;
  regulatory_note: string;
  mockup_prompt: string;
  image_url: string;
  seo_title: string;
  seo_description: string;
  business_summary: string;
  market_notes: string;
  sourcing_notes: string;
  fob_low_usd: string;
  fob_high_usd: string;
  cbm_per_unit: string;
  is_active: boolean;
  sort_order: string;
};

const emptyForm: EditState = {
  machine_name: "",
  category: "",
  processing_stage: "",
  capacity_range: "",
  power_requirement: "",
  short_desc: "",
  why_sells: "",
  regulatory_note: "",
  mockup_prompt: "",
  image_url: "",
  seo_title: "",
  seo_description: "",
  business_summary: "",
  market_notes: "",
  sourcing_notes: "",
  fob_low_usd: "",
  fob_high_usd: "",
  cbm_per_unit: "",
  is_active: true,
  sort_order: "0",
};

export default function MachinesAdminPage() {
  const [items, setItems] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [activeFilter, setActiveFilter] = useState("1");
  const [imageFilter, setImageFilter] = useState("");

  const [form, setForm] = useState<EditState>(emptyForm);
  const [savingNew, setSavingNew] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

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
      if (imageFilter === "with" || imageFilter === "missing") qs.set("image", imageFilter);

      const res = await fetch(`/api/internal/admin/machines?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load machines");
      }
      const nextItems = data.items || [];
      setItems(nextItems);
      const nextIds = new Set(nextItems.map((i: Machine) => i.id));
      setSelectedIds((prev) => prev.filter((id) => nextIds.has(id)));
    } catch (e: any) {
      setErr(e?.message || "Failed to load machines");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, activeFilter, imageFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  const missingImageCount = useMemo(
    () => items.filter((i) => !String(i.image_url || "").trim()).length,
    [items]
  );

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function selectAllVisible() {
    setSelectedIds(items.map((i) => i.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function bulkSetActive(next: boolean) {
    if (!selectedIds.length || bulkSaving) return;
    setErr(null);
    setBulkSaving(true);
    try {
      const res = await fetch("/api/internal/admin/machines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, is_active: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update");
      }
      clearSelection();
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update");
    } finally {
      setBulkSaving(false);
    }
  }

  async function quickToggle(id: number, next: boolean) {
    if (togglingId) return;
    setErr(null);
    setTogglingId(id);
    try {
      const res = await fetch(`/api/internal/admin/machines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update");
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to update");
    } finally {
      setTogglingId(null);
    }
  }

  function startEdit(item: Machine) {
    setExpandedId(item.id);
    setEdits((prev) => ({
      ...prev,
      [item.id]: {
        machine_name: item.machine_name || "",
        category: item.category || "",
        processing_stage: item.processing_stage || "",
        capacity_range: item.capacity_range || "",
        power_requirement: item.power_requirement || "",
        short_desc: item.short_desc || "",
        why_sells: item.why_sells || "",
        regulatory_note: item.regulatory_note || "",
        mockup_prompt: item.mockup_prompt || "",
        image_url: item.image_url || "",
        seo_title: item.seo_title || "",
        seo_description: item.seo_description || "",
        business_summary: item.business_summary || "",
        market_notes: item.market_notes || "",
        sourcing_notes: item.sourcing_notes || "",
        fob_low_usd: item.fob_low_usd != null ? String(item.fob_low_usd) : "",
        fob_high_usd: item.fob_high_usd != null ? String(item.fob_high_usd) : "",
        cbm_per_unit: item.cbm_per_unit != null ? String(item.cbm_per_unit) : "",
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
    if (!state.machine_name.trim() || !state.category.trim()) {
      setErr("Machine name and category are required.");
      return;
    }
    setSavingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/machines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_name: state.machine_name,
          category: state.category,
          processing_stage: state.processing_stage,
          capacity_range: state.capacity_range,
          power_requirement: state.power_requirement,
          short_desc: state.short_desc,
          why_sells: state.why_sells,
          regulatory_note: state.regulatory_note,
          mockup_prompt: state.mockup_prompt,
          image_url: state.image_url,
          seo_title: state.seo_title,
          seo_description: state.seo_description,
          business_summary: state.business_summary,
          market_notes: state.market_notes,
          sourcing_notes: state.sourcing_notes,
          fob_low_usd: state.fob_low_usd,
          fob_high_usd: state.fob_high_usd,
          cbm_per_unit: state.cbm_per_unit,
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
    if (!confirm("Delete this machine?")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/internal/admin/machines/${id}`, {
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

  async function createMachine() {
    if (savingNew) return;
    setErr(null);
    if (!form.machine_name.trim() || !form.category.trim()) {
      setErr("Machine name and category are required.");
      return;
    }
    setSavingNew(true);
    try {
      const res = await fetch("/api/internal/admin/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_name: form.machine_name,
          category: form.category,
          processing_stage: form.processing_stage,
          capacity_range: form.capacity_range,
          power_requirement: form.power_requirement,
          short_desc: form.short_desc,
          why_sells: form.why_sells,
          regulatory_note: form.regulatory_note,
          mockup_prompt: form.mockup_prompt,
          image_url: form.image_url,
          seo_title: form.seo_title,
          seo_description: form.seo_description,
          business_summary: form.business_summary,
          market_notes: form.market_notes,
          sourcing_notes: form.sourcing_notes,
          fob_low_usd: form.fob_low_usd,
          fob_high_usd: form.fob_high_usd,
          cbm_per_unit: form.cbm_per_unit,
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

  function exportCsv() {
    const qs = new URLSearchParams();
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    if (category.trim()) qs.set("category", category.trim());
    if (activeFilter === "0" || activeFilter === "1") qs.set("active", activeFilter);
    if (imageFilter === "with" || imageFilter === "missing") qs.set("image", imageFilter);
    const url = `/api/internal/admin/machines/export?${qs.toString()}`;
    window.location.href = url;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-neutral-100">
      <div>
        <h1 className="text-2xl font-semibold">Machines Catalog</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Manage agro-processing machines, view counts, and landed cost estimates for Lagos.
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Add new machine</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Machine name"
            value={form.machine_name}
            onChange={(e) => setForm((s) => ({ ...s, machine_name: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Processing stage"
            value={form.processing_stage}
            onChange={(e) => setForm((s) => ({ ...s, processing_stage: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Capacity range"
            value={form.capacity_range}
            onChange={(e) => setForm((s) => ({ ...s, capacity_range: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Power requirement"
            value={form.power_requirement}
            onChange={(e) => setForm((s) => ({ ...s, power_requirement: e.target.value }))}
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
            placeholder="CBM per unit"
            value={form.cbm_per_unit}
            onChange={(e) => setForm((s) => ({ ...s, cbm_per_unit: e.target.value }))}
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
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Business summary"
            value={form.business_summary}
            onChange={(e) => setForm((s) => ({ ...s, business_summary: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Market notes"
            value={form.market_notes}
            onChange={(e) => setForm((s) => ({ ...s, market_notes: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Sourcing notes"
            value={form.sourcing_notes}
            onChange={(e) => setForm((s) => ({ ...s, sourcing_notes: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="SEO description"
            value={form.seo_description}
            onChange={(e) => setForm((s) => ({ ...s, seo_description: e.target.value }))}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="SEO title"
            value={form.seo_title}
            onChange={(e) => setForm((s) => ({ ...s, seo_title: e.target.value }))}
          />
          <input
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) => setForm((s) => ({ ...s, image_url: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
            />
            Active
          </label>
          <button
            onClick={createMachine}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            disabled={savingNew}
          >
            {savingNew ? "Saving..." : "Add machine"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            placeholder="Search machines"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchableSelect
            className="w-52"
            value={category}
            options={[
              { value: "", label: "All categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            onChange={(next) => setCategory(next)}
          />
          <SearchableSelect
            className="w-44"
            value={activeFilter}
            options={[
              { value: "1", label: "Active only" },
              { value: "0", label: "Inactive only" },
              { value: "", label: "All" },
            ]}
            onChange={(next) => setActiveFilter(next)}
          />
          <SearchableSelect
            className="w-44"
            value={imageFilter}
            options={[
              { value: "", label: "All images" },
              { value: "with", label: "With images" },
              { value: "missing", label: "Missing images" },
            ]}
            onChange={(next) => setImageFilter(next)}
          />
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white"
            onClick={exportCsv}
          >
            Export CSV
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
          <span>Missing images: {missingImageCount}</span>
          <div className="flex flex-wrap items-center gap-2">
            <span>{selectedIds.length} selected</span>
            <button
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white"
              onClick={selectAllVisible}
              disabled={!items.length}
            >
              Select all visible
            </button>
            <button
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white"
              onClick={clearSelection}
              disabled={!selectedIds.length}
            >
              Clear selection
            </button>
            <button
              className="rounded-lg border border-emerald-500/30 px-2 py-1 text-xs text-emerald-200"
              onClick={() => bulkSetActive(true)}
              disabled={!selectedIds.length || bulkSaving}
            >
              Activate selected
            </button>
            <button
              className="rounded-lg border border-amber-500/30 px-2 py-1 text-xs text-amber-200"
              onClick={() => bulkSetActive(false)}
              disabled={!selectedIds.length || bulkSaving}
            >
              Deactivate selected
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-neutral-400">Loading...</div>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((item) => {
              const open = expandedId === item.id;
              const edit = edits[item.id];
              const hasImage = !!String(item.image_url || "").trim();
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/30">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">{item.machine_name}</p>
                        <p className="text-xs text-neutral-400">{item.category}</p>
                        <p className="text-xs text-neutral-500">
                          ₦{Math.round(item.landed_ngn_low || 0).toLocaleString()}–₦
                          {Math.round(item.landed_ngn_high || 0).toLocaleString()} landed
                        </p>
                        <p className="text-xs text-neutral-500">Views: {item.view_count ?? 0}</p>
                        <p className="text-xs text-neutral-500">Image: {hasImage ? "Yes" : "Missing"}</p>
                      </div>
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
                        onClick={() => quickToggle(item.id, !item.is_active)}
                        disabled={togglingId === item.id}
                      >
                        {item.is_active ? "Deactivate" : "Activate"}
                      </button>
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
                          value={edit.machine_name}
                          onChange={(e) => updateEdit(item.id, "machine_name", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.category}
                          onChange={(e) => updateEdit(item.id, "category", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.processing_stage}
                          onChange={(e) => updateEdit(item.id, "processing_stage", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.capacity_range}
                          onChange={(e) => updateEdit(item.id, "capacity_range", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.power_requirement}
                          onChange={(e) => updateEdit(item.id, "power_requirement", e.target.value)}
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
                          value={edit.cbm_per_unit}
                          onChange={(e) => updateEdit(item.id, "cbm_per_unit", e.target.value)}
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

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.business_summary}
                          onChange={(e) => updateEdit(item.id, "business_summary", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.market_notes}
                          onChange={(e) => updateEdit(item.id, "market_notes", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.sourcing_notes}
                          onChange={(e) => updateEdit(item.id, "sourcing_notes", e.target.value)}
                        />
                        <textarea
                          className="min-h-[80px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.seo_description}
                          onChange={(e) => updateEdit(item.id, "seo_description", e.target.value)}
                        />
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.seo_title}
                          onChange={(e) => updateEdit(item.id, "seo_title", e.target.value)}
                        />
                        <input
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                          value={edit.image_url}
                          onChange={(e) => updateEdit(item.id, "image_url", e.target.value)}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
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
                          {savingId === item.id ? "Saving..." : "Save changes"}
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
