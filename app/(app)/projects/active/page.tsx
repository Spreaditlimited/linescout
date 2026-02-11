"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type ProjectRow = {
  route_type: string;
  conversation_id: number;
  conversation_status: "active" | "cancelled" | string;
  handoff_id: number | null;
  stage: string | null;
  updated_at: string;
};

type QuoteSummary = {
  due_amount: number;
};

type SummaryRow = {
  conversation_id: number;
  stage: string;
  summary: string | null;
  quote_summary: QuoteSummary | null;
};

export default function ActiveProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const updatedLabel = useMemo(() => {
    if (!project?.updated_at) return "Recently updated";
    return `Updated ${shortDate.format(new Date(project.updated_at))}`;
  }, [project?.updated_at]);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus("loading");
      setMessage(null);

      const res = await authFetch("/api/mobile/projects");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load projects.");
        }
        return;
      }

      const rows: ProjectRow[] = Array.isArray(json?.projects) ? json.projects : [];
      const activeProjects = rows.filter((p) => String(p.conversation_status) === "active");
      const mostRecent = activeProjects.sort((a, b) => {
        const aTime = new Date(a.updated_at || 0).getTime();
        const bTime = new Date(b.updated_at || 0).getTime();
        return bTime - aTime;
      })[0] || null;

      if (!active) return;
      setProject(mostRecent);

      if (!mostRecent) {
        setSummary(null);
        setStatus("idle");
        return;
      }

      const summaryRes = await authFetch(
        `/api/mobile/projects/summary?conversation_id=${mostRecent.conversation_id}`
      );
      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (active) {
        setSummary(summaryRes.ok ? (summaryJson as SummaryRow) : null);
        setStatus("idle");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Active project</h1>
          <p className="mt-1 text-sm text-neutral-600">
            The most recent project currently in progress.
          </p>
        </div>
        <Link href="/projects" className="btn btn-outline px-4 py-2 text-xs">
          View all projects
        </Link>
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
            <div className="h-24 w-full rounded-3xl bg-neutral-100" />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      {status === "idle" && !project ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-neutral-600">
            No active projects yet. Start a new sourcing request to get going.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/white-label/ideas" className="btn btn-primary px-4 py-2 text-xs">
              Start a project
            </Link>
            <Link href="/projects" className="btn btn-outline px-4 py-2 text-xs">
              View all projects
            </Link>
          </div>
        </div>
      ) : null}

      {status === "idle" && project ? (
        <div className="mt-6 grid gap-4">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                  Project #{project.conversation_id}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                  {summary?.summary || "Project in progress"}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">{updatedLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {project.stage ? (
                  <span className="rounded-full border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] px-3 py-1 text-xs font-semibold text-[var(--agent-blue)]">
                    {project.stage}
                  </span>
                ) : null}
                <Link href={`/projects/${project.conversation_id}`} className="btn btn-primary px-4 py-2 text-xs">
                  Open project
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Route
                </p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">
                  {project.route_type.replace("_", " ")}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Outstanding
                </p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">
                  {money.format(Number(summary?.quote_summary?.due_amount || 0))}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Handoff
                </p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">
                  {project.handoff_id ? `#${project.handoff_id}` : "Pending"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-neutral-900">Next steps</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Keep the project moving by reviewing updates and replying to your agent when needed.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/projects/${project.conversation_id}`} className="btn btn-primary px-4 py-2 text-xs">
                Review updates
              </Link>
              <Link href="/projects" className="btn btn-outline px-4 py-2 text-xs">
                View all projects
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
