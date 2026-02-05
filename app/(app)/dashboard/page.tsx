"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  conversation_id: number;
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
  payments: Array<{ id: number; amount: number; paid_at: string | null; created_at: string | null }>;
};

type WalletResponse = {
  wallet?: {
    balance: string | number;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const totalOutstanding = useMemo(() => {
    return summaries.reduce((sum, item) => sum + Number(item.quote_summary?.due_amount || 0), 0);
  }, [summaries]);

  const recentPayments = useMemo(() => {
    const all = summaries.flatMap((item) => item.payments || []);
    const sorted = all.sort((a, b) => {
      const aDate = new Date(a.paid_at || a.created_at || 0).getTime();
      const bDate = new Date(b.paid_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
    return sorted.slice(0, 5);
  }, [summaries]);

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
          setMessage(projectsJson?.error || "Unable to load dashboard.");
        }
        return;
      }

      const rows: ProjectRow[] = Array.isArray(projectsJson?.projects)
        ? projectsJson.projects
        : [];

      const summariesRes = await Promise.all(
        rows.map(async (project) => {
          const res = await authFetch(
            `/api/mobile/projects/summary?conversation_id=${project.conversation_id}`
          );
          if (!res.ok) return null;
          const json = await res.json().catch(() => null);
          return json as SummaryRow | null;
        })
      );

      const walletRes = await authFetch("/api/mobile/wallet");
      const walletJson = await walletRes.json().catch(() => ({}));

      if (active) {
        setProjects(rows);
        setSummaries(summariesRes.filter((item): item is SummaryRow => !!item));
        setWallet(walletRes.ok ? (walletJson as WalletResponse) : null);
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
          <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600">Overview of your projects and payments.</p>
        </div>
        <div />
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
            <div className="h-24 w-full rounded-3xl bg-neutral-100" />
            <div className="h-24 w-full rounded-3xl bg-neutral-100" />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Active projects</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">{projects.length}</p>
          <p className="mt-2 text-xs text-neutral-600">Paid sourcing projects in progress.</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Outstanding</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">{money.format(totalOutstanding)}</p>
          <p className="mt-2 text-xs text-neutral-600">Total balance across active quotes.</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Wallet balance</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">
            {money.format(Number(wallet?.wallet?.balance || 0))}
          </p>
          <p className="mt-2 text-xs text-neutral-600">Available for new payments.</p>
          <Link
            href="/wallet"
            className="btn btn-outline mt-4 px-4 py-2 text-xs"
          >
            View wallet
          </Link>
        </div>
      </div>

      {status === "idle" && projects.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-neutral-600">No projects yet. Once a project is activated, it will appear here.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Latest project updates</h2>
          <div className="mt-4 grid gap-3">
            {summaries.slice(0, 4).map((item) => (
              <Link
                key={item.conversation_id}
                href={`/projects/${item.conversation_id}`}
                className="rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-700 hover:border-emerald-200"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-neutral-900">
                    Project #{item.conversation_id}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {item.stage}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-neutral-600">
                  {item.summary || "No summary yet."}
                </p>
              </Link>
            ))}
            {summaries.length === 0 ? (
              <div className="text-sm text-neutral-600">
                <p>No active projects yet.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Recent payments</h2>
          <div className="mt-4 grid gap-3">
            {recentPayments.map((p) => (
              <div key={p.id} className="rounded-2xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-neutral-900">{money.format(Number(p.amount || 0))}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  {p.paid_at
                    ? `Paid ${shortDate.format(new Date(p.paid_at))}`
                    : p.created_at
                    ? `Created ${shortDate.format(new Date(p.created_at))}`
                    : ""}
                </p>
              </div>
            ))}
            {recentPayments.length === 0 ? (
              <p className="text-sm text-neutral-600">No payments yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
