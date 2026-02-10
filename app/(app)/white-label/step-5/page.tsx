"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

function titleCase(s: string) {
  return String(s || "")
    .replace(/_/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function WhiteLabelStep5Page() {
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const summary = useMemo(() => {
    const p = project || {};
    const target =
      p?.target_landed_cost_naira != null
        ? `₦${Number(p.target_landed_cost_naira).toLocaleString()}`
        : "—";
    return {
      category: p?.category ? String(p.category) : "—",
      productName: p?.product_name ? String(p.product_name) : "—",
      productDesc: p?.product_desc ? String(p.product_desc) : "—",
      referenceLink: p?.no_link ? "No link" : p?.reference_link ? String(p.reference_link) : "—",
      quantityTier: p?.quantity_tier ? titleCase(String(p.quantity_tier)) : "—",
      brandingLevel: p?.branding_level ? titleCase(String(p.branding_level)) : "—",
      target,
    };
  }, [project]);

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
        if (!res.ok || !data?.ok) {
          if (!cancelled) setErr(data?.error || "Could not load your project file.");
          return;
        }
        if (!cancelled) setProject(data.project || null);
      } catch {
        if (!cancelled) setErr("We couldn’t load your project file. Please try again.");
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function proceed() {
    router.push("/sourcing-project?route_type=white_label");
  }

  async function startAfresh() {
    if (resetting) return;
    try {
      setResetting(true);
      const res = await authFetch("/api/white-label/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 1,
          status: "draft",
          category: "",
          product_name: "",
          product_desc: "",
          reference_link: "",
          no_link: false,
          quantity_tier: "",
          branding_level: "",
          target_landed_cost_naira: "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not reset this draft.");
      }
      router.replace("/white-label/step-1");
    } catch (e: any) {
      setErr(e?.message || "Could not reset this draft. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">White Label Wizard</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Review your project file</h1>
          <p className="text-sm text-neutral-600">
            This summary is what your specialist will use once you proceed. If anything is wrong, go back and correct
            it now.
          </p>
        </div>

        <div className="mt-6 pb-28">
          {prefillLoading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
              Loading your project file…
            </div>
          ) : err ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Project File</p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">White Label Sourcing Brief</h2>

                <div className="mt-4 grid gap-3 text-sm">
                  <Row label="Category" value={summary.category} />
                  <Row label="Product name" value={summary.productName} />
                  <Row label="Quantity tier" value={summary.quantityTier} />
                  <Row label="Branding level" value={summary.brandingLevel} />
                  <Row label="Target landed cost" value={summary.target} />
                </div>

                <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-900">Reference details</p>
                  <p className="mt-1 text-sm text-neutral-600">{summary.referenceLink}</p>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-900">Product description</p>
                  <p className="mt-1 text-sm text-neutral-600">{summary.productDesc}</p>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-neutral-900">Project Activation Deposit</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">₦100,000</p>
                <p className="mt-2 text-sm text-neutral-600">
                  This activates the White Label workflow and is fully credited to your first production order.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => router.replace("/white-label/step-4")} className="btn btn-ghost">
              Back
            </button>
            <button type="button" onClick={startAfresh} className="btn btn-outline">
              {resetting ? "Resetting..." : "Start afresh"}
            </button>
            <button type="button" onClick={proceed} className="btn btn-primary">
              Proceed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm font-semibold text-neutral-900">{value}</span>
    </div>
  );
}
