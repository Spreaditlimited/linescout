"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type QuantityTier = "test" | "scale" | "";
type BrandingLevel = "logo" | "packaging" | "mould" | "";

export default function WhiteLabelStep3Page() {
  const router = useRouter();
  const [quantityTier, setQuantityTier] = useState<QuantityTier>("");
  const [brandingLevel, setBrandingLevel] = useState<BrandingLevel>("");
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(
    () => quantityTier !== "" && brandingLevel !== "" && !loading,
    [quantityTier, brandingLevel, loading]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/white-label/get");
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (!res.ok || !data?.ok) return;
        if (!cancelled && data.project) {
          setQuantityTier(data.project.quantity_tier || "");
          setBrandingLevel(data.project.branding_level || "");
        }
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
    if (!canNext) {
      setErr("Please complete both sections to continue.");
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch("/api/white-label/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 3,
          quantity_tier: quantityTier,
          branding_level: brandingLevel,
          status: "draft",
        }),
      });
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      router.push("/white-label/step-4");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">White Label Wizard</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Quantity and branding depth</h1>
          <p className="text-sm text-neutral-600">
            These choices affect MOQ, tooling cost, and how much risk you carry at the start.
          </p>
        </div>

        <div className="mt-6 pb-24">
          {prefillLoading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
              Loading your draft…
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-neutral-800">Production quantity</p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantityTier("test")}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      quantityTier === "test"
                        ? "border-[var(--agent-blue)] bg-[var(--agent-blue)] text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-[rgba(45,52,97,0.2)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">Test run (50–200 units)</p>
                    <p className={`mt-1 text-xs ${quantityTier === "test" ? "text-white/80" : "text-neutral-500"}`}>
                      Used to test the market before committing serious capital.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantityTier("scale")}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      quantityTier === "scale"
                        ? "border-[var(--agent-blue)] bg-[var(--agent-blue)] text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-[rgba(45,52,97,0.2)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">Scale run (1,000+ units)</p>
                    <p className={`mt-1 text-xs ${quantityTier === "scale" ? "text-white/80" : "text-neutral-500"}`}>
                      Lower unit cost, but requires stronger cash planning.
                    </p>
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-neutral-800">Branding level</p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setBrandingLevel("logo")}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      brandingLevel === "logo"
                        ? "border-[var(--agent-blue)] bg-[var(--agent-blue)] text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-[rgba(45,52,97,0.2)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">Logo only</p>
                    <p className={`mt-1 text-xs ${brandingLevel === "logo" ? "text-white/80" : "text-neutral-500"}`}>
                      Your logo applied to an existing product.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrandingLevel("packaging")}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      brandingLevel === "packaging"
                        ? "border-[var(--agent-blue)] bg-[var(--agent-blue)] text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-[rgba(45,52,97,0.2)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">Custom packaging</p>
                    <p className={`mt-1 text-xs ${brandingLevel === "packaging" ? "text-white/80" : "text-neutral-500"}`}>
                      Branded box, inserts, and presentation.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrandingLevel("mould")}
                    className={`rounded-2xl border px-4 py-4 text-left ${
                      brandingLevel === "mould"
                        ? "border-[var(--agent-blue)] bg-[var(--agent-blue)] text-white"
                        : "border-neutral-200 bg-white text-neutral-900 hover:border-[rgba(45,52,97,0.2)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">Full custom mould</p>
                    <p className={`mt-1 text-xs ${brandingLevel === "mould" ? "text-white/80" : "text-neutral-500"}`}>
                      New tooling. Higher MOQ and longer lead time.
                    </p>
                  </button>
                </div>
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
            <button type="button" onClick={() => router.replace("/white-label/step-2")} className="btn btn-outline">
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
