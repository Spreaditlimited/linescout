// app/internal/handoffs/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type HandoffItem = {
  id: number;
  token: string;
  handoff_type: string;
  status: string;

  customer_name: string | null;
  email: string | null;
  whatsapp_number: string | null;
  context: string | null;

  claimed_by: string | null;
  claimed_at: string | null;

  created_at: string | null;
  paid_at: string | null;
  manufacturer_found_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  resolved_at: string | null;

  bank_id: number | null;
  bank_name: string | null;

  shipping_company_id: number | null;
  shipping_company_name: string | null;
  shipper: string | null;
  tracking_number: string | null;

  conversation_id: number | null;

  release_audit?: Array<{
    id: number;
    conversation_id: number | null;
    released_by_id: number | null;
    released_by_name: string | null;
    released_by_role: string | null;
    previous_status: string | null;
    product_paid: number | null;
    shipping_paid: number | null;
    created_at: string | null;
  }>;
};

type ApiResp = { ok: true; item: HandoffItem } | { ok: false; error: string };

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

function goBack() {
  if (typeof window !== "undefined") {
    window.history.back();
  }
}

function badge(status: string) {
  const s = String(status || "").toLowerCase();
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

  if (s === "pending") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "claimed") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "manufacturer_found")
    return `${base} border-indigo-700/60 bg-indigo-500/10 text-indigo-200`;
  if (s === "paid") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  if (s === "shipped") return `${base} border-violet-700/60 bg-violet-500/10 text-violet-200`;
  if (s === "delivered") return `${base} border-green-700/60 bg-green-500/10 text-green-200`;
  if (s === "cancelled") return `${base} border-red-700/60 bg-red-500/10 text-red-200`;
  if (s === "resolved") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;

  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

function field(label: string, value: any, opts?: { mono?: boolean }) {
  const v = value === null || value === undefined || String(value).trim() === "" ? "N/A" : value;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-sm text-neutral-200 break-words ${
          opts?.mono ? "font-mono text-[13px]" : ""
        }`}
      >
        {v}
      </div>
    </div>
  );
}

export default function InternalHandoffDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const handoff = useMemo(() => (data && data.ok ? data.item : null), [data]);

  async function load() {
    if (!id) return;

    setLoading(true);
    setBanner(null);

    try {
      const res = await fetch(`/api/internal/handoffs/${id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResp | null;
      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        setData(json || { ok: false, error: "Failed to load handoff" });
      } else {
        setData(json);
      }
    } catch {
      setData({ ok: false, error: "Failed to load handoff" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const card = "rounded-2xl border border-neutral-800 bg-neutral-950 p-4";
  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700";
  const btnDisabled = "opacity-60 cursor-not-allowed";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">
              <Link href="/internal/agent-handoffs" className="hover:text-neutral-300">
                Sourcing Projects
              </Link>{" "}
              <span className="text-neutral-700">/</span>{" "}
              <span className="text-neutral-300">Handoff #{id}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-neutral-100 break-all">
                {handoff?.token || `Handoff #${id}`}
              </div>
              {handoff?.status ? <span className={badge(handoff.status)}>{handoff.status}</span> : null}
              {handoff?.handoff_type ? (
                <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900/50 px-2 py-0.5 text-[11px] font-semibold text-neutral-200">
                  {handoff.handoff_type}
                </span>
              ) : null}
            </div>

            <div className="mt-1 text-sm text-neutral-400 break-words">
              {handoff?.email || "No email"}
              {handoff?.customer_name ? ` • ${handoff.customer_name}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              className={btn}
            >
              ← Back
            </button>

            <button
              onClick={load}
              className={`${btn} ${loading ? btnDisabled : ""}`}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {banner ? (
          <div
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              banner.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {banner.msg}
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-neutral-400">Loading...</p> : null}

      {data && !data.ok ? (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4">
          <p className="text-sm text-red-200">{data.error}</p>
        </div>
      ) : null}

      {handoff ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Left column */}
          <div className="space-y-4">
            {/* Customer */}
            <div className={card}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-neutral-100">Customer</div>
                {handoff.conversation_id ? (
                  <span className="text-xs text-neutral-500">
                    Conversation ID:{" "}
                    <span className="text-neutral-200 font-semibold">{handoff.conversation_id}</span>
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field("Name", handoff.customer_name)}
                {field("Email", handoff.email)}
                {field("WhatsApp", handoff.whatsapp_number, { mono: true })}
                {field("Created", fmt(handoff.created_at))}
              </div>

              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">Claim</div>
                <div className="mt-1 text-sm text-neutral-200">
                  {handoff.claimed_by ? (
                    <>
                      <span className="font-semibold">{handoff.claimed_by}</span>{" "}
                      <span className="text-neutral-500">•</span> {fmt(handoff.claimed_at)}
                    </>
                  ) : (
                    "Unclaimed"
                  )}
                </div>
              </div>
            </div>

            {/* Context */}
            <div className={card}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-neutral-100">Project brief</div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(handoff.context || "");
                    setBanner({ type: "ok", msg: "Brief copied." });
                  }}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                >
                  Copy
                </button>
              </div>

              <div className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                {handoff.context || "N/A"}
              </div>
            </div>

            {/* Shipping + Bank */}
            <div className={card}>
              <div className="text-sm font-semibold text-neutral-100">Shipping & Banking</div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field("Bank", handoff.bank_name)}
                {field("Shipping company", handoff.shipping_company_name)}
                {field("Shipper", handoff.shipper)}
                {field("Tracking number", handoff.tracking_number, { mono: true })}
              </div>

              {handoff.tracking_number ? (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-300">
                  Tip: tracking numbers often have spaces copied by mistake. If tracking looks wrong, re-copy and save clean.
                </div>
              ) : null}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Timeline */}
            <div className={card}>
              <div className="text-sm font-semibold text-neutral-100">Timeline</div>

              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-500">Manufacturer found</div>
                  <div className="mt-1 text-sm text-neutral-200">{fmt(handoff.manufacturer_found_at)}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-500">Paid</div>
                  <div className="mt-1 text-sm text-neutral-200">{fmt(handoff.paid_at)}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-500">Shipped</div>
                  <div className="mt-1 text-sm text-neutral-200">{fmt(handoff.shipped_at)}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-500">Delivered</div>
                  <div className="mt-1 text-sm text-neutral-200">{fmt(handoff.delivered_at)}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-xs text-neutral-500">Resolved</div>
                  <div className="mt-1 text-sm text-neutral-200">{fmt(handoff.resolved_at)}</div>
                </div>

                {handoff.cancelled_at ? (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/25 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-red-200">Cancelled</div>
                      <div className="text-[11px] text-red-200/80">{fmt(handoff.cancelled_at)}</div>
                    </div>
                    <div className="mt-2 text-sm text-neutral-200 whitespace-pre-wrap break-words">
                      {handoff.cancel_reason || "No reason provided."}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quick IDs */}
            <div className={card}>
              <div className="text-sm font-semibold text-neutral-100">References</div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                {field("Handoff ID", handoff.id, { mono: true })}
                {field("Conversation ID", handoff.conversation_id ?? "N/A", { mono: true })}
                {field("Bank ID", handoff.bank_id ?? "N/A", { mono: true })}
                {field("Shipping company ID", handoff.shipping_company_id ?? "N/A", { mono: true })}
              </div>
            </div>

            {/* Release audit */}
            <div className={card}>
              <div className="text-sm font-semibold text-neutral-100">Release audit</div>
              {handoff.release_audit && handoff.release_audit.length ? (
                <div className="mt-3 space-y-3">
                  {handoff.release_audit.map((row) => (
                    <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-neutral-400">
                          {row.created_at ? fmt(row.created_at) : "N/A"}
                        </div>
                        {row.previous_status ? (
                          <span className={badge(row.previous_status)}>{row.previous_status}</span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm text-neutral-200">
                        Released by{" "}
                        <span className="font-semibold">
                          {row.released_by_name || `User ${row.released_by_id || "N/A"}`}
                        </span>
                        {row.released_by_role ? ` (${row.released_by_role})` : ""}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-neutral-400 sm:grid-cols-2">
                        <div>
                          Conversation ID:{" "}
                          <span className="text-neutral-200">{row.conversation_id ?? "N/A"}</span>
                        </div>
                        <div>
                          Product paid:{" "}
                          <span className="text-neutral-200">{row.product_paid ?? 0}</span>
                        </div>
                        <div>
                          Shipping paid:{" "}
                          <span className="text-neutral-200">{row.shipping_paid ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No release activity recorded.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
