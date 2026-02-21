"use client";

import { Children, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import SearchableSelect from "@/app/internal/_components/SearchableSelect";

type Option = { value: string; label: string };

type Props = {
  action: string;
  searchPlaceholder: string;
  initial?: {
    q?: string | null;
    category?: string | null;
    price?: string | null;
    regulatory?: string | null;
    sort?: string | null;
  };
  categoryOptions: Option[];
  priceOptions: Option[];
  sortOptions: Option[];
  regulatoryOptions?: Option[];
  labels: {
    category: string;
    price: string;
    sort: string;
    regulatory?: string;
  };
  gridColsClass?: string;
  clearHref?: string;
  clearLabel?: string;
  countrySelector?: React.ReactNode;
  countryLabel?: string;
};

export default function FilterForm({
  action,
  searchPlaceholder,
  initial,
  categoryOptions,
  priceOptions,
  sortOptions,
  regulatoryOptions,
  labels,
  gridColsClass = "sm:grid-cols-2 lg:grid-cols-4",
  clearHref,
  clearLabel = "Clear filters",
  countrySelector,
  countryLabel = "Country",
}: Props) {
  const [q, setQ] = useState(String(initial?.q || ""));
  const [category, setCategory] = useState(String(initial?.category || ""));
  const [price, setPrice] = useState(String(initial?.price || ""));
  const [regulatory, setRegulatory] = useState(String(initial?.regulatory || ""));
  const [sort, setSort] = useState(String(initial?.sort || ""));

  const hasFilters = useMemo(() => {
    return Boolean(q || category || price || regulatory || sort);
  }, [q, category, price, regulatory, sort]);

  return (
    <form
      method="GET"
      action={action}
      className="rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[var(--agent-blue)] px-5 py-3 text-xs font-semibold text-white"
        >
          Search
        </button>
      </div>

      <div className={`mt-4 grid gap-3 ${gridColsClass}`}>
        {countrySelector ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">{countryLabel}</label>
            {Children.toArray(countrySelector)}
          </div>
        ) : null}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">{labels.category}</label>
          <SearchableSelect
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            variant="light"
          />
          <input type="hidden" name="category" value={category} />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">{labels.price}</label>
          <SearchableSelect
            value={price}
            onChange={setPrice}
            options={priceOptions}
            variant="light"
          />
          <input type="hidden" name="price" value={price} />
        </div>

        {regulatoryOptions && labels.regulatory ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">{labels.regulatory}</label>
            <SearchableSelect
              value={regulatory}
              onChange={setRegulatory}
              options={regulatoryOptions}
              variant="light"
            />
            <input type="hidden" name="regulatory" value={regulatory} />
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">{labels.sort}</label>
          <SearchableSelect value={sort} onChange={setSort} options={sortOptions} variant="light" />
          <input type="hidden" name="sort" value={sort} />
        </div>
      </div>

      {clearHref && hasFilters ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={clearHref} className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
            {clearLabel}
          </Link>
        </div>
      ) : null}
    </form>
  );
}
