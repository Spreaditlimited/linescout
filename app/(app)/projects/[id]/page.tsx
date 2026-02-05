"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type QuoteSummary = {
  quote_id: number;
  quote_token: string;
  product_name: string | null;
  quantity: number;
  due_amount: number;
  shipping_type: string | null;
  product_due: number;
  product_paid: number;
  product_balance: number;
  shipping_due: number;
  shipping_paid: number;
  shipping_balance: number;
};

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

type SummaryResponse = {
  conversation_id: number;
  stage: string;
  summary: string | null;
  quote_summary: QuoteSummary | null;
  payments: PaymentItem[];
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = Number(params?.id || 0);

  const [data, setData] = useState<SummaryResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const hasPayments = useMemo(() => (data?.payments || []).length > 0, [data]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!conversationId) return;
      setStatus("loading");
      setMessage(null);

      const res = await authFetch(`/api/mobile/projects/summary?conversation_id=${conversationId}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load project summary.");
        }
        return;
      }

      if (active) {
        setData(json as SummaryResponse);
        setStatus("idle");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [conversationId, router]);

  if (!conversationId) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Invalid project.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Project</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Project #{conversationId}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/conversations/${conversationId}`}
            className="btn btn-primary px-4 py-2 text-xs"
          >
            Open chat
          </Link>
          <Link
            href="/projects"
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:border-emerald-300"
          >
            Back to projects
          </Link>
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Loading project summary…
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {message}
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 grid gap-6">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-900">Project status</h2>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {data.stage || "pending"}
              </span>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm text-neutral-600">
              {data.summary || "No summary yet. Your agent will update this once progress begins."}
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Quote snapshot</h2>
            {data.quote_summary ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-neutral-500">Product</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-800">
                    {data.quote_summary.product_name || "Quoted items"}
                  </p>
                  <p className="mt-2 text-xs text-neutral-600">
                    Quantity: {data.quote_summary.quantity || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-500">Outstanding balance</p>
                  <p className="mt-1 text-xl font-semibold text-neutral-900">
                    {money.format(data.quote_summary.due_amount || 0)}
                  </p>
                  <p className="mt-2 text-xs text-neutral-600">
                    Shipping: {data.quote_summary.shipping_type || "Pending"}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold text-neutral-600">Product payments</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
                    <span>Due</span>
                    <span>{money.format(data.quote_summary.product_due || 0)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-neutral-600">
                    <span>Paid</span>
                    <span>{money.format(data.quote_summary.product_paid || 0)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs font-semibold text-neutral-800">
                    <span>Balance</span>
                    <span>{money.format(data.quote_summary.product_balance || 0)}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold text-neutral-600">Shipping payments</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
                    <span>Due</span>
                    <span>{money.format(data.quote_summary.shipping_due || 0)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-neutral-600">
                    <span>Paid</span>
                    <span>{money.format(data.quote_summary.shipping_paid || 0)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs font-semibold text-neutral-800">
                    <span>Balance</span>
                    <span>{money.format(data.quote_summary.shipping_balance || 0)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-600">
                Quote details will appear once your agent issues a quote.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Payments</h2>
            {!hasPayments ? (
              <p className="mt-3 text-sm text-neutral-600">No payments recorded yet.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {data.payments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-neutral-200 p-4">
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
      ) : null}
    </div>
  );
}
