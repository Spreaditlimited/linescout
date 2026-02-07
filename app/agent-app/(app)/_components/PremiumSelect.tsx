"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
  meta?: string;
};

export default function PremiumSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  disabled,
  searchable = true,
  hint,
  error,
}: {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  hint?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const selected = options.find((opt) => opt.value === value) || null;

  return (
    <div className="relative" ref={rootRef}>
      {label ? <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</label> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`mt-2 flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-2 text-sm ${
          disabled
            ? "border-[rgba(45,52,97,0.15)] bg-neutral-50 text-neutral-400"
            : "border-[rgba(45,52,97,0.2)] bg-white text-neutral-900"
        }`}
      >
        <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
          {selected?.label || placeholder}
        </span>
        <span className="text-xs text-neutral-400">▾</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
          {searchable ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="mb-2 w-full rounded-xl border border-[rgba(45,52,97,0.2)] px-3 py-2 text-xs"
            />
          ) : null}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length ? (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                    opt.value === value ? "bg-[rgba(45,52,97,0.08)] text-[#2D3461]" : "hover:bg-neutral-50"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.meta ? <span className="text-xs text-neutral-400">{opt.meta}</span> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-neutral-400">No matches found.</div>
            )}
          </div>
        </div>
      ) : null}

      {hint ? <p className="mt-2 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p className="mt-2 text-xs text-amber-600">{error}</p> : null}
    </div>
  );
}
