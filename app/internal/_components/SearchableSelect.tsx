"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

type Option = { value: string; label: string };

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  emptyMessage?: string;
  className?: string;
  variant?: "dark" | "light";
};

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  disabled = false,
  searchable = true,
  emptyMessage = "No results",
  className = "",
  variant = "dark",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => {
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open && searchable) {
      inputRef.current?.focus();
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, filtered.findIndex((opt) => opt.value === value));
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, filtered, value]);

  const pick = (opt: Option) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  const isLight = variant === "light";
  const buttonClass = isLight
    ? "flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
    : "flex w-full items-center justify-between rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60";
  const menuClass = isLight
    ? "absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
    : "absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl";
  const searchWrapClass = isLight
    ? "flex items-center gap-2 border-b border-neutral-200 px-3 py-2"
    : "flex items-center gap-2 border-b border-neutral-900 px-3 py-2";
  const searchInputClass = isLight
    ? "w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 outline-none"
    : "w-full bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none";
  const optionIdleClass = isLight ? "text-neutral-700 hover:bg-neutral-100" : "text-neutral-200 hover:bg-neutral-900";
  const optionActiveClass = isLight ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white";
  const selectedBadgeClass = isLight ? "text-xs text-emerald-600" : "text-xs text-emerald-400";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className={buttonClass}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? (isLight ? "text-neutral-900" : "text-white") : "text-neutral-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          className={menuClass}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const opt = filtered[activeIndex];
              if (opt) pick(opt);
            }
          }}
        >
          {searchable ? (
            <div className={searchWrapClass}>
              <Search className={`h-4 w-4 ${isLight ? "text-neutral-500" : "text-neutral-500"}`} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className={searchInputClass}
              />
            </div>
          ) : null}
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-neutral-500">{emptyMessage}</div>
            ) : (
              filtered.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    idx === activeIndex ? optionActiveClass : optionIdleClass
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.value === value ? (
                    <span className={selectedBadgeClass}>Selected</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
