"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FilterForm from "@/components/filters/FilterForm";
import WhiteLabelCatalogClient from "@/components/white-label/WhiteLabelCatalogClient";
import MarketingEventTracker from "@/components/marketing/MarketingEventTracker";
import WhiteLabelCountrySelector from "@/components/white-label/WhiteLabelCountrySelector";

type IdeasResponse =
  | {
      ok: true;
      items: any[];
      total: number;
      categories: string[];
      mostViewed: any[];
      countryCode: string;
      profileCountryCode: string;
      currencyCode: string;
      currency: { code: string; symbol: string };
      amazonComparisonEnabled: boolean;
      q: string;
      category: string;
      price: string;
      regulatory: string;
      sort: string;
      page: number;
      totalPages: number;
      categoryOptions: { value: string; label: string }[];
      priceOptions: { value: string; label: string }[];
      regulatoryOptions: { value: string; label: string }[];
      sortOptions: { value: string; label: string }[];
      countryOptions: { value: string; label: string }[];
    }
  | { ok: false; error?: string };

function slugify(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildPageHref(params: {
  q: string;
  category: string;
  page: number;
  price: string;
  regulatory: string;
  sort: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.price) qs.set("price", params.price);
  if (params.regulatory) qs.set("regulatory", params.regulatory);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `/white-label/ideas?${query}` : "/white-label/ideas";
}

export default function WhiteLabelIdeasPageClient() {
  const searchParams = useSearchParams();
  const queryKey = searchParams?.toString() || "";
  const [state, setState] = useState<IdeasResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const querySuffix = queryKey ? `?${queryKey}` : "";
    fetch(`/api/white-label/ideas/list${querySuffix}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: IdeasResponse) => {
        if (!active) return;
        setState(json);
      })
      .catch(() => {
        if (!active) return;
        setState({ ok: false, error: "Unable to load ideas." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queryKey]);

  const data = state && state.ok ? state : null;
  const q = data?.q || "";
  const category = data?.category || "";
  const price = data?.price || "";
  const regulatory = data?.regulatory || "";
  const sort = data?.sort || "";
  const currency = data?.currency || { code: "NGN", symbol: "₦" };

  const categoryLinks = useMemo(() => data?.categories || [], [data]);

  return (
    <div className="px-6 py-10">
      <MarketingEventTracker eventType="white_label_view" />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
          White Label Ideas
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900">Browse product ideas</h1>
        <p className="text-sm text-neutral-600">
          Search, filter, and shortlist white label products before starting a sourcing project.
        </p>
      </div>

      <div className="mt-6">
        <FilterForm
          action="/white-label/ideas"
          searchPlaceholder="Search products, categories, or use cases"
          initial={{ q, category, price, regulatory, sort }}
          categoryOptions={data?.categoryOptions || [{ value: "", label: "All categories" }]}
          priceOptions={data?.priceOptions || [{ value: "", label: "Any budget" }]}
          regulatoryOptions={data?.regulatoryOptions || [{ value: "", label: "Any status" }]}
          sortOptions={data?.sortOptions || [{ value: "", label: "Recommended" }]}
          gridColsClass="sm:grid-cols-2 lg:grid-cols-5"
          labels={{
            category: "Category",
            price: `Budget (landed per unit in ${currency.symbol})`,
            regulatory: "Regulatory",
            sort: "Sort by",
          }}
          clearHref="/white-label/ideas"
          countrySelector={
            <WhiteLabelCountrySelector
              value={data?.countryCode || "NG"}
              options={data?.countryOptions || []}
              locked={Boolean(data?.profileCountryCode)}
              lockMessage="To see product prices in another market, change your country in your profile."
              lockHref="/profile"
            />
          }
          countryLabel="Country"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
        <div>
          Showing{" "}
          <span className="font-semibold text-neutral-900">{data?.items?.length ?? 0}</span> of{" "}
          <span className="font-semibold text-neutral-900">{data?.total ?? 0}</span> ideas
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`idea-skeleton-${idx}`}
              className="rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="h-36 w-full rounded-[18px] bg-neutral-100" />
              <div className="mt-4 h-4 w-2/3 rounded-full bg-neutral-100" />
              <div className="mt-2 h-3 w-1/2 rounded-full bg-neutral-100" />
              <div className="mt-4 h-8 w-24 rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : null}

      {data?.mostViewed?.length ? (
        <div className="mt-6 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Most viewed</p>
              <h2 className="mt-1 text-lg font-semibold text-neutral-900">Trending ideas right now</h2>
            </div>
            <Link href="/white-label/ideas" className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">
              See all
            </Link>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {data.mostViewed.map((item) => (
              <Link
                key={item.id}
                href={`/white-label/ideas/${item.slug || slugify(item.product_name)}`}
                className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-3"
              >
                <div className="flex h-24 items-center justify-center rounded-[16px] border border-neutral-200 bg-[#F2F3F5]">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="text-xs font-semibold text-neutral-500">YOUR LOGO</div>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-neutral-900">{item.product_name}</p>
                <p className="text-xs text-neutral-500">{item.category}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildPageHref({ q, category: "", page: 1, price, regulatory, sort })}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              !category ? "bg-[var(--agent-blue)] text-white" : "border border-neutral-200 bg-white text-neutral-600"
            }`}
          >
            All
          </Link>
          {categoryLinks.map((c) => (
            <Link
              key={c}
              href={buildPageHref({ q, category: c, page: 1, price, regulatory, sort })}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                category === c
                  ? "bg-[var(--agent-blue)] text-white"
                  : "border border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {!loading && data?.items ? (
          <WhiteLabelCatalogClient
            items={data.items}
            detailBase="/white-label/ideas"
            currencyCode={data.currencyCode}
            amazonComparisonEnabled={data.amazonComparisonEnabled}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Page {data?.page ?? 1} of {data?.totalPages ?? 1}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildPageHref({
                q,
                category,
                page: Math.max(1, (data?.page ?? 1) - 1),
                price,
                regulatory,
                sort,
              })}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                (data?.page ?? 1) === 1
                  ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-300"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900"
              }`}
              aria-disabled={(data?.page ?? 1) === 1}
            >
              Previous
            </Link>
            <Link
              href={buildPageHref({
                q,
                category,
                page: Math.min(data?.totalPages ?? 1, (data?.page ?? 1) + 1),
                price,
                regulatory,
                sort,
              })}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                (data?.page ?? 1) >= (data?.totalPages ?? 1)
                  ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-300"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900"
              }`}
              aria-disabled={(data?.page ?? 1) >= (data?.totalPages ?? 1)}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
