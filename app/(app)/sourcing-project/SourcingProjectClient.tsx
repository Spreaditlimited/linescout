"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

type RouteStatus = {
  ok: boolean;
  route_type: RouteType;
  conversation_id: number | null;
  chat_mode: "ai_only" | "limited_human" | "paid_human" | null;
  payment_status: "unpaid" | "pending" | "paid" | null;
  conversation_status: "active" | "cancelled" | null;
  handoff_id: number | null;
  has_active_project: boolean;
  is_cancelled: boolean;
  commitment_due_ngn?: number;
  error?: string;
};

type ProjectItem = {
  route_type: RouteType;
  conversation_id: number;
  conversation_status: "active" | "cancelled";
  handoff_id: number | null;
  has_active_project: boolean;
  updated_at: string;
  stage: string | null;
};

type ProjectsResponse = { ok: boolean; projects?: ProjectItem[]; error?: string };

function routeLabel(rt: RouteType) {
  if (rt === "white_label") return "White Label";
  if (rt === "simple_sourcing") return "Simple Sourcing";
  return "Machine Sourcing";
}

function stageLabel(s: string | null) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "Pending";
  if (t === "manufacturer_found") return "Manufacturer Found";
  return t.replace(/_/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function pickMostRecent(projects: ProjectItem[]) {
  const sorted = [...projects].sort((a, b) => {
    const ta = Date.parse(a.updated_at || "");
    const tb = Date.parse(b.updated_at || "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return sorted[0] || null;
}

function formatNgn(v: any) {
  const n = Number(v || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `₦${safe.toLocaleString("en-NG")}`;
}

function Card({
  children,
  subtle = false,
  className = "",
}: {
  children: React.ReactNode;
  subtle?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-3xl border p-5",
        subtle ? "border-black/10 bg-black/[0.03]" : "border-black/10 bg-white",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export default function SourcingProjectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeType = (searchParams.get("route_type") || "machine_sourcing") as RouteType;
  const sourceConversationIdRaw = Number(searchParams.get("source_conversation_id") || 0);
  const sourceConversationId =
    Number.isFinite(sourceConversationIdRaw) && sourceConversationIdRaw > 0
      ? sourceConversationIdRaw
      : null;
  const productIdRaw = String(searchParams.get("product_id") || "").trim();
  const productId = productIdRaw && /^\d+$/.test(productIdRaw) ? productIdRaw : "";
  const productName = String(searchParams.get("product_name") || "").trim();
  const productCategory = String(searchParams.get("product_category") || "").trim();
  const productLandedPerUnit = String(searchParams.get("product_landed_ngn_per_unit") || "").trim();
  const nextUrl = `/sourcing-project?route_type=${encodeURIComponent(routeType)}${
    sourceConversationId ? `&source_conversation_id=${encodeURIComponent(String(sourceConversationId))}` : ""
  }${productId ? `&product_id=${encodeURIComponent(productId)}` : ""}${
    productName ? `&product_name=${encodeURIComponent(productName)}` : ""
  }${productCategory ? `&product_category=${encodeURIComponent(productCategory)}` : ""}${
    productLandedPerUnit ? `&product_landed_ngn_per_unit=${encodeURIComponent(productLandedPerUnit)}` : ""
  }`;
  const signInUrl = `/sign-in?next=${encodeURIComponent(nextUrl)}`;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<RouteStatus | null>(null);

  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProjects, setActiveProjects] = useState<ProjectItem[]>([]);
  const mostRecentActive = useMemo(() => pickMostRecent(activeProjects), [activeProjects]);
  const [working, setWorking] = useState<"pay" | "human" | null>(null);
  const commitmentDue = useMemo(() => {
    const raw = Number(status?.commitment_due_ngn || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 100000;
  }, [status?.commitment_due_ngn]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await authFetch(`/api/mobile/route-status?route_type=${routeType}`);
        const data: RouteStatus | null = await res.json().catch(() => null);
        if (res.status === 401) {
          router.replace(signInUrl);
          return;
        }
        if (!res.ok || !data?.ok) {
          if (!cancelled) setErr(data?.error || `Could not load (${res.status})`);
          return;
        }
        if (!cancelled) setStatus(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setProjectsLoading(true);
        const res = await authFetch("/api/mobile/projects");
        const data: ProjectsResponse | null = await res.json().catch(() => null);
        if (res.status === 401) {
          router.replace(signInUrl);
          return;
        }
        if (!res.ok || !data?.ok) return;
        const list = Array.isArray(data.projects) ? data.projects : [];
        const active = list.filter(
          (p) =>
            p.route_type === routeType &&
            p.conversation_status === "active" &&
            typeof p.handoff_id === "number" &&
            p.handoff_id > 0 &&
            String(p.stage || "").trim().toLowerCase() !== "delivered"
        );
        if (!cancelled) setActiveProjects(active);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeType]);

  async function goPay() {
    if (working) return;
    setWorking("pay");
    setErr(null);
    const qs = new URLSearchParams({
      purpose: "sourcing",
      route_type: routeType,
      ...(sourceConversationId ? { source_conversation_id: String(sourceConversationId) } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(productName ? { product_name: productName } : {}),
      ...(productCategory ? { product_category: productCategory } : {}),
      ...(productLandedPerUnit ? { product_landed_ngn_per_unit: productLandedPerUnit } : {}),
    });
    router.push(`/paystack-checkout?${qs.toString()}`);
    setTimeout(() => setWorking(null), 250);
  }

  async function goHuman() {
    if (working) return;
    setWorking("human");
    setErr(null);
    try {
      const res = await authFetch("/api/mobile/limited-human/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_type: routeType,
          ...(sourceConversationId ? { source_conversation_id: sourceConversationId } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "Could not start brief specialist chat.");
        return;
      }
      router.push(`/machine?route_type=${routeType}&conversation_id=${data.conversation_id}`);
    } catch (e: any) {
      setErr(e?.message || "Network error. Please try again.");
    } finally {
      setWorking(null);
    }
  }

  const showCancelledNotice = status?.is_cancelled === true;
  const activeCount = activeProjects.length;

  return (
    <div className="relative min-h-screen px-6 pb-28 pt-6 text-neutral-900">
      <div className="mx-auto max-w-3xl">
        {loading ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
            Loading…
          </div>
        ) : err ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {err}
          </div>
        ) : (
          <>
            <div className="self-start rounded-full bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">
              Before payment
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
              Choose how you want to proceed
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              You can start a sourcing project by paying a sourcing fee - credited back to you on your first order, or
              ask a specialist a quick question first for reassurance. The quick human chat is limited and does not
              create a project.
            </p>

            {sourceConversationId ? (
              <div className="mt-5">
                <Card subtle>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Using your chat as context</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        This project can be attached to the AI conversation you came from.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {showCancelledNotice ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">Previous project was cancelled</p>
                <p className="mt-1 text-xs text-red-600">
                  If you want to start again, you will need to pay again to create a new project.
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">Pay the sourcing commitment fee</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Start a paid sourcing project and unlock your specialist chat. The fee is credited to your first
                  order.
                </p>
                <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-4 py-3 text-xs font-semibold text-[var(--agent-blue)]">
                  Commitment fee: ₦{commitmentDue.toLocaleString()}
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">Brief specialist chat</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Ask a quick question for reassurance before you commit. This does not create a project.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">Active projects</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      If you already have an active project, you can continue it. Or you can start a new one.
                    </p>
                  </div>
                  <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600">
                    {projectsLoading ? "…" : String(activeCount)}
                  </div>
                </div>

                {projectsLoading ? (
                  <p className="mt-4 text-sm text-neutral-600">Checking your projects…</p>
                ) : activeCount === 0 ? (
                  <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                    No active projects yet for {routeLabel(routeType)}.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-semibold text-neutral-500">Most recent</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-neutral-900">{routeLabel(routeType)}</p>
                          <p className="mt-1 text-xs text-neutral-600">
                            Stage: {stageLabel(mostRecentActive?.stage || null)}
                          </p>
                          {mostRecentActive?.updated_at ? (
                            <p className="mt-1 text-xs text-neutral-500">
                              Updated: {new Date(mostRecentActive.updated_at).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                        {mostRecentActive?.conversation_id ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/projects/${mostRecentActive.conversation_id}`)}
                            className="btn btn-outline ml-auto shrink-0 rounded-2xl px-4 py-2 text-xs"
                          >
                            View project
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => router.push("/projects")}
                        className="btn btn-ghost rounded-2xl"
                      >
                        See all projects
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="mt-6 text-xs text-neutral-500">
              Paid sourcing chat is available only after payment is verified.
            </p>
          </>
        )}
      </div>

      <div className="mt-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={goPay}
                disabled={working !== null}
                className="btn btn-primary w-full rounded-2xl disabled:opacity-60 sm:w-auto"
              >
                {working === "pay"
                  ? "Preparing..."
                  : routeType === "white_label"
                  ? `Continue to Paystack (${formatNgn(commitmentDue)})`
                  : `Continue to Paystack (${formatNgn(commitmentDue)})`}
              </button>
              <button
                type="button"
                onClick={goHuman}
                disabled={working !== null}
                className="btn btn-outline w-full rounded-2xl disabled:opacity-60 sm:w-auto"
              >
                {working === "human" ? "Starting..." : "Ask a specialist a quick question"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
