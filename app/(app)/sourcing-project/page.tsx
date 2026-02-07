"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label";

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
  return rt === "white_label" ? "White Label" : "Machine Sourcing";
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

export default function SourcingProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeType = (searchParams.get("route_type") || "machine_sourcing") as RouteType;
  const sourceConversationIdRaw = Number(searchParams.get("source_conversation_id") || 0);
  const sourceConversationId =
    Number.isFinite(sourceConversationIdRaw) && sourceConversationIdRaw > 0
      ? sourceConversationIdRaw
      : null;

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
          router.replace("/sign-in");
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
          router.replace("/sign-in");
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
    <div className="px-6 py-10">
      <div className="relative">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Project sourcing</p>
          <h1 className="text-2xl font-semibold text-neutral-900">{routeLabel(routeType)}</h1>
          <p className="text-sm text-neutral-600">
            Choose how you want to proceed with this sourcing request.
          </p>
        </div>

        <div className="mt-6 pb-28">
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
              {showCancelledNotice ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Previous project was cancelled. If you want to start again, you will need to pay again to create a new
                  project.
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-neutral-900">Pay the sourcing commitment fee</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    Start a paid sourcing project and unlock your specialist chat. The fee is credited to your first
                    order.
                  </p>
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
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

              <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
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
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{routeLabel(routeType)}</p>
                          <p className="mt-1 text-xs text-neutral-600">
                            Stage: {stageLabel(mostRecentActive?.stage || null)}
                          </p>
                        </div>
                        {mostRecentActive?.conversation_id ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/projects/${mostRecentActive.conversation_id}`)}
                            className="btn btn-outline px-4 py-2 text-xs"
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
                        className="btn btn-ghost"
                      >
                        See all projects
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={goPay}
              disabled={working !== null}
              className="btn btn-primary w-full disabled:opacity-60"
            >
              {working === "pay"
                ? "Preparing..."
                : routeType === "white_label"
                ? "Continue on Paystack"
                : "Start machine sourcing"}
            </button>
            <button
              type="button"
              onClick={goHuman}
              disabled={working !== null}
              className="btn btn-outline w-full disabled:opacity-60"
            >
              {working === "human" ? "Starting..." : "Ask a specialist"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
