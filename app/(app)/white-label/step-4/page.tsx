"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

function parseNairaInput(raw: string) {
  const cleaned = String(raw || "").replace(/[^\d]/g, "");
  const n = Number(cleaned);
  return { cleaned, n, ok: Number.isFinite(n) };
}

function formatNairaPreview(raw: string) {
  const { cleaned, n } = parseNairaInput(raw);
  if (!cleaned) return "—";
  if (!Number.isFinite(n)) return "—";
  return `₦${n.toLocaleString()}`;
}

export default function WhiteLabelStep4Page() {
  const router = useRouter();
  const [targetLandedCost, setTargetLandedCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(() => {
    const { ok, n } = parseNairaInput(targetLandedCost);
    return ok && n >= 100 && n <= 500000 && !loading;
  }, [targetLandedCost, loading]);

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
        const v =
          data?.project?.target_landed_cost_naira != null
            ? String(data.project.target_landed_cost_naira)
            : "";
        if (!cancelled) setTargetLandedCost(v);
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
    const { ok, n } = parseNairaInput(targetLandedCost);
    if (!ok || !Number.isFinite(n)) {
      setErr("Enter a valid amount using numbers only. Example: 8500");
      return;
    }
    if (n < 100 || n > 500000) {
      setErr("Enter a realistic target between ₦100 and ₦500,000 per unit.");
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch("/api/white-label/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          target_landed_cost_naira: n,
          status: "draft",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "We could not save your progress. Please try again.");
        return;
      }
      router.push("/white-label/step-5");
    } catch {
      setErr("We could not save your progress. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  const preview = formatNairaPreview(targetLandedCost);

  return (
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">White Label Wizard</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Target landed cost per unit</h1>
          <p className="text-sm text-neutral-600">
            This is your maximum cost per unit after shipping and clearing into Nigeria. If it’s unrealistic, we will
            tell you early to avoid wasted time and money.
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
                <label className="text-xs font-semibold text-neutral-600">Target landed cost (₦)</label>
                <input
                  value={targetLandedCost}
                  onChange={(e) => setTargetLandedCost(String(e.target.value || "").replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                  placeholder="Example: 8500"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  Preview: <span className="font-semibold text-neutral-900">{preview}</span>
                </p>
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-800">Nigeria reality check</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Landed cost can jump due to exchange rate movement, port delays, duties, and inland logistics. Your
                    target should include buffer, not wishful thinking.
                  </p>
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
            <button type="button" onClick={() => router.replace("/white-label/step-3")} className="btn btn-outline">
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
