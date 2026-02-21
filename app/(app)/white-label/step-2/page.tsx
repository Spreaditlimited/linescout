"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

export default function WhiteLabelStep2Page() {
  const router = useRouter();
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [noLink, setNoLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
          if (!cancelled) setErr(data?.error || "Could not load your draft.");
          return;
        }
        const p = data.project;
        if (p && !cancelled) {
          setProductName(p.product_name || "");
          setProductDesc(p.product_desc || "");
          setReferenceLink(p.reference_link || "");
          setNoLink(Boolean(p.no_link));
        }
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

  const canNext = useMemo(() => {
    const nameOk = productName.trim().length >= 3;
    const descOk = productDesc.trim().length >= 10;
    const linkOk = noLink || referenceLink.trim().length >= 8;
    return nameOk && descOk && linkOk && !loading;
  }, [productName, productDesc, referenceLink, noLink, loading]);

  async function saveNext() {
    setErr(null);
    if (!canNext) {
      setErr("Complete the fields properly to continue.");
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch("/api/white-label/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 2,
          product_name: productName,
          product_desc: productDesc,
          reference_link: referenceLink,
          no_link: noLink,
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
      router.push("/white-label/step-3");
    } catch {
      setErr("We couldn’t save your progress. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">White Label Wizard</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Define the product clearly</h1>
          <p className="text-sm text-neutral-600">
            The goal is to remove guessing. A strong reference link makes quoting faster and more accurate.
          </p>
        </div>

        <div className="mt-6 pb-24">
          {prefillLoading ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
              Loading your draft…
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <label className="text-xs font-semibold text-neutral-600">Product name</label>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                    placeholder="Example: 20,000mAh power bank with fast charge"
                  />
                  <p className="mt-2 text-xs text-neutral-500">Use the name you’d use to sell it in your market.</p>
                </div>

                <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <label className="text-xs font-semibold text-neutral-600">Short description (key features)</label>
                  <textarea
                    rows={4}
                    value={productDesc}
                    onChange={(e) => setProductDesc(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
                    placeholder="Size, material, color, packaging, features..."
                  />
                  <p className="mt-2 text-xs text-neutral-500">
                    The more precise this is, the fewer mistakes happen during sampling and production.
                  </p>
                </div>

                <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-neutral-600">Reference link</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Amazon, Alibaba, AliExpress, brand website, or any similar product.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-neutral-600">
                      <span>No link</span>
                      <input
                        type="checkbox"
                        checked={noLink}
                        onChange={(e) => setNoLink(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                    </label>
                  </div>
                  <input
                    value={referenceLink}
                    onChange={(e) => setReferenceLink(e.target.value)}
                    disabled={noLink}
                    className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)] disabled:bg-neutral-50"
                    placeholder="Paste a link that matches your product"
                  />
                  <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-sm font-semibold text-neutral-800">Quick note</p>
                    <p className="mt-1 text-sm text-neutral-600">
                      If you don’t have a link, describe size, material, color, and packaging clearly.
                      This is how we avoid wrong samples and wasted timelines.
                    </p>
                  </div>
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
            <button
              type="button"
              onClick={() => router.replace("/white-label/step-1")}
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
