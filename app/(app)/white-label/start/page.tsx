"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type WhiteLabelProject = {
  status?: string | null;
  step?: number | null;
  category?: string | null;
  product_name?: string | null;
  product_desc?: string | null;
  reference_link?: string | null;
  quantity_tier?: string | null;
  branding_level?: string | null;
  target_landed_cost_naira?: number | string | null;
};

export default function WhiteLabelStartPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const auth = await authFetch("/api/auth/me");
        if (!auth.ok) {
          router.replace("/sign-in");
          return;
        }

        const res = await authFetch("/api/white-label/get");
        const data = await res.json().catch(() => ({}));
        const project: WhiteLabelProject | null = data?.project || null;

        const hasContent =
          !!project &&
          !!(
            project?.category ||
            project?.product_name ||
            project?.product_desc ||
            project?.reference_link ||
            project?.quantity_tier ||
            project?.branding_level ||
            project?.target_landed_cost_naira
          );
        const status = String(project?.status || "").trim().toLowerCase();
        const isActive = status === "submitted" || status === "paid";
        const stepRaw = Number(project?.step || 1);
        const step = Number.isFinite(stepRaw) ? Math.min(Math.max(stepRaw, 1), 5) : 1;

        if (cancelled) return;
        if (isActive && hasContent) {
          router.replace("/white-label/step-5");
          return;
        }
        if (hasContent) {
          router.replace(`/white-label/step-${step}`);
          return;
        }
        router.replace("/white-label/step-1");
      } catch {
        if (cancelled) return;
        router.replace("/white-label/step-1");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="px-6 py-10">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">White Label Wizard</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Preparing your draft</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We’re loading your latest progress so you can continue where you left off.
        </p>
        <div className="mt-5 h-2 w-full rounded-full bg-neutral-100">
          <div className="h-2 w-1/2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
