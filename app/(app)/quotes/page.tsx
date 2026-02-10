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

type ProjectRow = {
  conversation_id: number;
};

type QuoteSummary = {
  quote_id: number;
  quote_token: string;
  product_name: string | null;
  quantity: number;
  due_amount: number;
  shipping_type: string | null;
  product_balance: number;
  shipping_balance: number;
};

type SummaryRow = {
  conversation_id: number;
  stage: string;
  quote_summary: QuoteSummary | null;
};

export default function QuotesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const hasQuotes = useMemo(() => rows.length > 0, [rows]);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);

      const projectsRes = await authFetch("/api/mobile/projects");
      const projectsJson = await projectsRes.json().catch(() => ({}));
      if (!projectsRes.ok) {
        if (projectsRes.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(projectsJson?.error || "Unable to load quotes.");
        }
        return;
      }

      const projects: ProjectRow[] = Array.isArray(projectsJson?.projects)
        ? projectsJson.projects
        : [];

      const summaries = await Promise.all(
        projects.map(async (project) => {
          const res = await authFetch(
            `/api/mobile/projects/summary?conversation_id=${project.conversation_id}`
          );
          if (!res.ok) return null;
          const json = await res.json().catch(() => null);
          return json as SummaryRow | null;
        })
      );

      const filtered = summaries.filter(
        (item): item is SummaryRow => !!item && !!item.quote_summary
      );

      if (active) {
        setRows(filtered);
        setStatus("idle");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Quotes</h1>
          <p className="mt-1 text-sm text-neutral-600">View quote totals and outstanding balances.</p>
        </div>
        <Link
          href="/projects"
          className="btn btn-outline px-4 py-2 text-xs"
        >
          View projects
        </Link>
      </div>

      <div className="mt-6 grid gap-4">
        {status === "loading" ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
              <div className="h-16 w-full rounded-2xl bg-neutral-100" />
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {status === "idle" && !hasQuotes ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600 shadow-sm">
            <p>No quotes yet. Once your agent issues a quote, it will show up here.</p>
            <Link
              href="/projects"
              className="btn btn-outline mt-4 px-4 py-2 text-xs"
            >
              View projects
            </Link>
          </div>
        ) : null}

        {rows.map((row) => (
          <Link
            key={row.conversation_id}
            href={`/projects/${row.conversation_id}`}
            className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(45,52,97,0.2)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Quote</p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                  {row.quote_summary?.product_name || "Quoted items"}
                </h2>
                <p className="mt-2 text-xs text-neutral-600">Stage: {row.stage}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                {money.format(row.quote_summary?.due_amount || 0)} due
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
              <span>Product balance: {money.format(row.quote_summary?.product_balance || 0)}</span>
              <span>Shipping balance: {money.format(row.quote_summary?.shipping_balance || 0)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
