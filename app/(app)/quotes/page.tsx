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
  handoff_id?: number | null;
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
  display_currency_code?: string | null;
  due_amount_display?: number;
  product_balance_display?: number;
  shipping_balance_display?: number;
};

type SummaryRow = {
  conversation_id: number;
  stage: string;
  quote_summary: QuoteSummary | null;
  quote_summaries?: QuoteSummary[] | null;
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
          const summaryQuery = project.handoff_id
            ? `handoff_id=${project.handoff_id}`
            : `conversation_id=${project.conversation_id}`;
          const res = await authFetch(
            `/api/mobile/projects/summary?${summaryQuery}`
          );
          if (!res.ok) return null;
          const json = await res.json().catch(() => null);
          return json as SummaryRow | null;
        })
      );

      const filtered = summaries.filter((item): item is SummaryRow => !!item && (!!item.quote_summary || !!item.quote_summaries?.length));

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

        {rows.flatMap((row) => {
          const summaries = row.quote_summaries?.length ? row.quote_summaries : row.quote_summary ? [row.quote_summary] : [];
          return summaries.map((summary) => {
            const currency = summary.display_currency_code || "NGN";
            const formatter = new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency,
              maximumFractionDigits: 0,
            });
            const dueDisplay = Number.isFinite(Number(summary.due_amount_display))
              ? Number(summary.due_amount_display)
              : summary.due_amount || 0;
            const productBalanceDisplay = Number.isFinite(Number(summary.product_balance_display))
              ? Number(summary.product_balance_display)
              : summary.product_balance || 0;
            const shippingBalanceDisplay = Number.isFinite(Number(summary.shipping_balance_display))
              ? Number(summary.shipping_balance_display)
              : summary.shipping_balance || 0;

            return (
              <Link
                key={`${row.conversation_id}-${summary.quote_id}`}
                href={summary.quote_token ? `/quote/${summary.quote_token}` : `/projects/${row.conversation_id}`}
                className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(45,52,97,0.2)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Quote</p>
                    <h2 className="mt-2 text-lg font-semibold text-neutral-900">
                      {summary.product_name || "Quoted items"}
                    </h2>
                    <p className="mt-2 text-xs text-neutral-600">Stage: {row.stage}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                    {formatter.format(dueDisplay)} due
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
                  <span>Product balance: {formatter.format(productBalanceDisplay)}</span>
                  <span>Shipping balance: {formatter.format(shippingBalanceDisplay)}</span>
                </div>
              </Link>
            );
          });
        })}
      </div>
    </div>
  );
}
