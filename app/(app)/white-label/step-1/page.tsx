"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { Check, ChevronRight } from "lucide-react";

type Category =
  | "Electronics"
  | "Beauty"
  | "Home Goods"
  | "Fashion"
  | "Food & Beverage"
  | "Other";

const CATEGORIES: Category[] = [
  "Electronics",
  "Beauty",
  "Home Goods",
  "Fashion",
  "Food & Beverage",
  "Other",
];

export default function WhiteLabelStep1Page() {
  const router = useRouter();
  const [category, setCategory] = useState<Category | "">("");
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(() => category !== "" && !loading, [category, loading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPrefillLoading(true);
        setErr(null);
        const res = await authFetch("/api/white-label/get");
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (!res.ok || !data?.ok) {
          if (!cancelled) setErr(data?.error || "Could not load your draft.");
          return;
        }
        const p = data.project;
        if (!cancelled && p?.category) setCategory(p.category);
      } catch {
        if (!cancelled) setErr("Network error. Please try again.");
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveNext() {
    setErr(null);
    if (!category) {
      setErr("Please choose a category to continue.");
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch("/api/white-label/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 1,
          category,
          status: "draft",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "Could not save. Try again.");
        return;
      }
      router.push("/white-label/step-2");
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">White Label Wizard</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Choose your product category</h1>
          <p className="text-sm text-neutral-600">
            This helps us route your project to the right specialist. If you’re not sure, pick the closest option.
          </p>
        </div>

        <div className="mt-6 pb-24">
          {prefillLoading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
              Loading your draft…
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {CATEGORIES.map((c) => {
                  const selected = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`group rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-neutral-200 bg-white text-neutral-900 hover:border-emerald-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{c}</p>
                          <p className={`mt-1 text-xs ${selected ? "text-white/80" : "text-neutral-500"}`}>
                            Tap to select
                          </p>
                        </div>
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            selected ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {selected ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {err ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {err}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.replace("/machine")}
              className="btn btn-outline"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveNext}
              disabled={!canNext}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? "Saving..." : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
