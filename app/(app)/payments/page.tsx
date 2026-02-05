"use client";

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

type PaymentItem = {
  id: number;
  purpose: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string | null;
  paid_at: string | null;
};

type SummaryRow = {
  conversation_id: number;
  payments: PaymentItem[];
};

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const hasPayments = useMemo(() => payments.length > 0, [payments]);

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
          setMessage(projectsJson?.error || "Unable to load payments.");
        }
        return;
      }

      const projects: Array<{ conversation_id: number }> = Array.isArray(projectsJson?.projects)
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

      const allPayments = summaries
        .filter((item): item is SummaryRow => !!item)
        .flatMap((item) => item.payments || []);

      if (active) {
        setPayments(allPayments);
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
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Payments</h1>
        <p className="mt-1 text-sm text-neutral-600">Wallet balance and payment history.</p>
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded-full bg-neutral-100" />
            <div className="h-20 w-full rounded-2xl bg-neutral-100" />
            <div className="h-20 w-full rounded-2xl bg-neutral-100" />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Payment history</h2>
        {!hasPayments ? (
          <div className="mt-3 text-sm text-neutral-600">
            <p>No payments recorded yet.</p>
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="btn btn-outline mt-3 px-4 py-2 text-xs"
            >
              View projects
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {payments.map((payment) => (
              <div key={`${payment.id}-${payment.purpose}`} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      {payment.purpose?.replace(/_/g, " ")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-neutral-900">
                      {money.format(Number(payment.amount || 0))}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {payment.method} · {payment.status}
                    </p>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {payment.paid_at
                      ? `Paid ${shortDate.format(new Date(payment.paid_at))}`
                      : payment.created_at
                      ? `Created ${shortDate.format(new Date(payment.created_at))}`
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
