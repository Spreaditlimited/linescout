"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import AgentAppShell from "../../_components/AgentAppShell";

type HandoffDetail = {
  id: number;
  token: string;
  handoff_type: string;
  status: string;
  assigned_agent_id?: number | null;
  assigned_agent_username?: string | null;
  resolved_customer_name?: string | null;
  customer_name?: string | null;
  email: string | null;
  whatsapp_number: string | null;
  context: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string | null;
  paid_at: string | null;
  manufacturer_found_at: string | null;
  manufacturer_name?: string | null;
  manufacturer_address?: string | null;
  manufacturer_contact_name?: string | null;
  manufacturer_contact_email?: string | null;
  manufacturer_contact_phone?: string | null;
  manufacturer_details_updated_at?: string | null;
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
};

type PaymentInfo = {
  total_due: number;
  total_paid: number;
  balance: number;
  currency: string;
  quote_summary?: {
    product_due: number;
    product_paid: number;
    product_balance: number;
    shipping_due: number;
    shipping_paid: number;
    shipping_balance: number;
  } | null;
} | null;

type QuoteItem = {
  id: number;
  token: string;
  status: string;
  created_at: string | null;
  total_due_ngn?: number | null;
  created_by_name?: string | null;
};

type Attachment = {
  id: number;
  original_filename: string | null;
  secure_url: string | null;
  mime_type: string | null;
  bytes: number | null;
};

function formatStamp(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function statusLabel(raw?: string | null) {
  const s = String(raw || "pending").trim().toLowerCase();
  if (s === "manufacturer_found") return "Manufacturer Found";
  return s.replace(/_/g, " ").replace(/\w/g, (m) => m.toUpperCase());
}

function ProjectDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const handoffId = Number(params?.id || 0);
  const conversationId = Number(searchParams.get("conversation_id") || 0);
  const isMine = searchParams.get("mine") === "1";

  const [detail, setDetail] = useState<HandoffDetail | null>(null);
  const [payments, setPayments] = useState<PaymentInfo>(null);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [shipper, setShipper] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerAddress, setManufacturerAddress] = useState("");
  const [manufacturerContactName, setManufacturerContactName] = useState("");
  const [manufacturerEmail, setManufacturerEmail] = useState("");
  const [manufacturerPhone, setManufacturerPhone] = useState("");

  const loadDetail = useCallback(async () => {
    if (!handoffId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/internal/handoffs/${handoffId}`, { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        setDetail(null);
        return;
      }
      setDetail(json.item || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [handoffId]);

  const loadPayments = useCallback(async () => {
    if (!handoffId) return;
    const res = await fetch(`/api/linescout-handoffs/payments?handoffId=${handoffId}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setPayments(null);
      return;
    }
    const financials = json?.financials || null;
    const quoteSummary = json?.quote_summary || null;
    setPayments(financials ? { ...financials, quote_summary: quoteSummary } : null);
  }, [handoffId]);

  const loadQuotes = useCallback(async () => {
    if (!handoffId) return;
    const res = await fetch(`/api/internal/quotes?handoff_id=${handoffId}`, { cache: "no-store", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setQuotes([]);
      return;
    }
    setQuotes(Array.isArray(json.items) ? json.items : []);
  }, [handoffId]);

  const loadAttachments = useCallback(async () => {
    if (!conversationId) return;
    const res = await fetch(`/api/internal/paid-chat/messages?conversation_id=${conversationId}&limit=40`, {
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setAttachments([]);
      return;
    }
    setAttachments(Array.isArray(json.attachments) ? json.attachments : []);
  }, [conversationId]);

  useEffect(() => {
    loadDetail();
    loadPayments();
    loadQuotes();
    loadAttachments();
  }, [loadDetail, loadPayments, loadQuotes, loadAttachments]);

  useEffect(() => {
    if (!detail) return;
    setShipper(detail.shipper || "");
    setTrackingNumber(detail.tracking_number || "");
    setManufacturerName(detail.manufacturer_name || "");
    setManufacturerAddress(detail.manufacturer_address || "");
    setManufacturerContactName(detail.manufacturer_contact_name || "");
    setManufacturerEmail(detail.manufacturer_contact_email || "");
    setManufacturerPhone(detail.manufacturer_contact_phone || "");
  }, [detail]);

  const statusRaw = String(detail?.status || "pending").trim().toLowerCase();
  const milestones = [
    { key: "pending", label: "Pending", at: detail?.created_at },
    { key: "claimed", label: "Claimed", at: detail?.claimed_at },
    { key: "manufacturer_found", label: "Manufacturer Found", at: detail?.manufacturer_found_at },
    { key: "paid", label: "Paid", at: detail?.paid_at },
    { key: "shipped", label: "Shipped", at: detail?.shipped_at },
    { key: "delivered", label: "Delivered", at: detail?.delivered_at },
  ];

  const canEditManufacturer =
    statusRaw === "manufacturer_found" || statusRaw === "paid" || statusRaw === "shipped";

  const quoteAllowed = ["manufacturer_found", "paid", "shipped", "delivered"].includes(statusRaw);
  const quoteReadOnly = statusRaw === "delivered";

  const productBalance = payments?.quote_summary?.product_balance ?? payments?.balance ?? 0;
  const productFullyPaid =
    payments?.quote_summary ? Number(payments.quote_summary.product_balance || 0) <= 0 : false;

  const canClaim =
    statusRaw === "pending" && !detail?.assigned_agent_id && !!conversationId;

  const claimProject = useCallback(async () => {
    if (!conversationId) return;
    setClaiming(true);
    setErr(null);
    try {
      const res = await fetch("/api/internal/paid-chat/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        return;
      }
      await loadDetail();
    } catch (e: any) {
      setErr(e?.message || "Failed to claim project.");
    } finally {
      setClaiming(false);
    }
  }, [conversationId, loadDetail]);

  const updateStatus = useCallback(
    async (next: "manufacturer_found" | "paid" | "shipped" | "delivered") => {
      if (!detail?.id) return;
      setUpdating(true);
      setErr(null);
      try {
        const body: any = { id: detail.id, status: next };
        if (next === "shipped") {
          body.shipper = shipper.trim();
          body.tracking_number = trackingNumber.trim();
        }
        const res = await fetch(`/api/linescout-handoffs/update-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          setErr(String(json?.error || `Failed (${res.status})`));
          return;
        }
        await loadDetail();
        await loadPayments();
      } catch (e: any) {
        setErr(e?.message || "Failed to update status.");
      } finally {
        setUpdating(false);
      }
    },
    [detail?.id, shipper, trackingNumber, loadDetail, loadPayments]
  );

  const updateManufacturer = useCallback(async () => {
    if (!detail?.id) return;
    setUpdating(true);
    setErr(null);
    try {
      const res = await fetch(`/api/linescout-handoffs/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: detail.id,
          manufacturer_update: true,
          manufacturer_name: manufacturerName.trim(),
          manufacturer_address: manufacturerAddress.trim(),
          manufacturer_contact_name: manufacturerContactName.trim(),
          manufacturer_contact_email: manufacturerEmail.trim(),
          manufacturer_contact_phone: manufacturerPhone.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || `Failed (${res.status})`));
        return;
      }
      await loadDetail();
    } catch (e: any) {
      setErr(e?.message || "Failed to update manufacturer details.");
    } finally {
      setUpdating(false);
    }
  }, [detail?.id, manufacturerName, manufacturerAddress, manufacturerContactName, manufacturerEmail, manufacturerPhone, loadDetail]);

  if (!handoffId) {
    return (
      <AgentAppShell title="Project" subtitle="Invalid project id.">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Invalid handoff id.
        </div>
      </AgentAppShell>
    );
  }

  return (
    <AgentAppShell title="Project detail" subtitle="Manage milestones, manufacturer details, and files.">
      {loading ? (
        <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          Loading project…
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : detail ? (
        <div className="grid gap-6">
          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D3461]">Project</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {statusLabel(detail.status)}
                  </span>
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                  {detail.resolved_customer_name || detail.customer_name || "Customer"}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">Handoff #{detail.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canClaim ? (
                  <button
                    type="button"
                    onClick={claimProject}
                    disabled={claiming}
                    className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
                  >
                    {claiming ? "Claiming…" : "Claim project"}
                  </button>
                ) : null}
                {conversationId ? (
                  <Link
                    href={`/agent-app/inbox/${conversationId}?kind=paid`}
                    className={`rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] ${
                      quoteReadOnly ? "pointer-events-none opacity-50" : "hover:bg-[rgba(45,52,97,0.08)]"
                    }`}
                  >
                    Open chat
                  </Link>
                ) : null}
                {quoteAllowed ? (
                  <Link
                    href={`/agent-app/quote-builder?handoff_id=${detail.id}${quoteReadOnly ? "&readonly=1" : ""}`}
                    className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
                  >
                    {quoteReadOnly ? "View quote" : "Build quote"}
                  </Link>
                ) : (
                  <span className="rounded-full border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs text-neutral-500">
                    Quote unlocks after manufacturer found
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-neutral-500">Assigned agent</p>
                <p className="text-sm font-semibold text-neutral-900">{detail.assigned_agent_username || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Product balance</p>
                <p className="text-sm font-semibold text-neutral-900">{Number(productBalance || 0).toLocaleString()}</p>
              </div>
            </div>

            {detail.context ? (
              <div className="mt-5 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-4 text-sm text-neutral-600">
                {detail.context}
              </div>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Milestones</p>
              <div className="mt-4 space-y-3">
                {milestones.map((m) => (
                  <div key={m.key} className="flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3">
                    <span className="text-sm text-neutral-700">{m.label}</span>
                    <span className="text-xs text-neutral-500">{m.at ? formatStamp(m.at) : "—"}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {statusRaw === "claimed" ? (
                  <button
                    type="button"
                    onClick={() => updateStatus("manufacturer_found")}
                    disabled={updating}
                    className="rounded-2xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                  >
                    Mark manufacturer found
                  </button>
                ) : null}
                {statusRaw === "manufacturer_found" ? (
                  <button
                    type="button"
                    onClick={() => updateStatus("paid")}
                    disabled={updating}
                    className="rounded-2xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                  >
                    Mark product paid
                  </button>
                ) : null}
              {(statusRaw === "manufacturer_found" || statusRaw === "paid") ? (
                <button
                  type="button"
                  onClick={() => updateStatus("shipped")}
                  disabled={updating || !productFullyPaid}
                  className="rounded-2xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                >
                  Mark shipped
                </button>
              ) : null}
              {(statusRaw === "manufacturer_found" || statusRaw === "paid") && !productFullyPaid ? (
                <p className="text-xs text-neutral-500 sm:col-span-2">
                  Product balance must be fully paid before marking shipped.
                </p>
              ) : null}
                {statusRaw === "shipped" ? (
                  <button
                    type="button"
                    onClick={() => updateStatus("delivered")}
                    disabled={updating}
                    className="rounded-2xl border border-[rgba(45,52,97,0.2)] px-4 py-2 text-xs font-semibold text-[#2D3461] hover:bg-[rgba(45,52,97,0.08)]"
                  >
                    Mark delivered
                  </button>
                ) : null}
              </div>

              {(statusRaw === "manufacturer_found" || statusRaw === "paid") ? (
                <div className="mt-5 grid gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Shipper</label>
                    <input
                      value={shipper}
                      onChange={(e) => setShipper(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                      placeholder="DHL, SF Express, etc."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Tracking number</label>
                    <input
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                      placeholder="Enter tracking number"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Payments snapshot</p>
              {payments ? (
                <div className="mt-4 space-y-3 text-sm text-neutral-600">
                  <div className="flex items-center justify-between">
                    <span>Total due</span>
                    <span className="font-semibold text-neutral-900">{Number(payments.total_due || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total paid</span>
                    <span className="font-semibold text-neutral-900">{Number(payments.total_paid || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Balance</span>
                    <span className="font-semibold text-neutral-900">{Number(payments.balance || 0).toLocaleString()}</span>
                  </div>
                  {payments.quote_summary ? (
                    <div className="rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-3 text-xs text-neutral-600">
                      Product balance: {Number(payments.quote_summary.product_balance || 0).toLocaleString()} · Shipping balance: {Number(payments.quote_summary.shipping_balance || 0).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-neutral-500">Payments data not available.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm font-semibold text-neutral-900">Manufacturer details</p>
              {canEditManufacturer ? (
                <button
                  type="button"
                  onClick={updateManufacturer}
                  disabled={updating}
                  className="rounded-full bg-[#2D3461] px-4 py-2 text-xs font-semibold text-white"
                >
                  Save changes
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Company name</label>
                <input
                  value={manufacturerName}
                  onChange={(e) => setManufacturerName(e.target.value)}
                  disabled={!canEditManufacturer}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Contact name</label>
                <input
                  value={manufacturerContactName}
                  onChange={(e) => setManufacturerContactName(e.target.value)}
                  disabled={!canEditManufacturer}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Email</label>
                <input
                  value={manufacturerEmail}
                  onChange={(e) => setManufacturerEmail(e.target.value)}
                  disabled={!canEditManufacturer}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Phone</label>
                <input
                  value={manufacturerPhone}
                  onChange={(e) => setManufacturerPhone(e.target.value)}
                  disabled={!canEditManufacturer}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Address</label>
                <textarea
                  value={manufacturerAddress}
                  onChange={(e) => setManufacturerAddress(e.target.value)}
                  disabled={!canEditManufacturer}
                  className="mt-2 w-full rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-4 py-2 text-sm"
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Quotes</p>
              {quotes.length ? (
                <div className="mt-4 space-y-3">
                  {quotes.map((q) => (
                    <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-neutral-900">Quote #{q.id}</p>
                        <p className="text-xs text-neutral-500">Created {formatStamp(q.created_at)}</p>
                      </div>
                      <div className="text-xs text-neutral-500">NGN {Number(q.total_due_ngn || 0).toLocaleString()}</div>
                      <Link
                        href={`/agent-app/quote-builder?handoff_id=${detail.id}&readonly=1`}
                        className="text-xs font-semibold text-[#2D3461]"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No quotes yet for this project.</p>
              )}
            </div>

            <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold text-neutral-900">Files</p>
              {attachments.length ? (
                <div className="mt-4 space-y-3">
                  {attachments.map((file) => (
                    <div key={file.id} className="flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-neutral-900">{file.original_filename || "Attachment"}</p>
                        <p className="text-xs text-neutral-500">{file.mime_type || "file"}</p>
                      </div>
                      {file.secure_url ? (
                        <a href={file.secure_url} target="_blank" className="text-xs font-semibold text-[#2D3461]">
                          Open
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No files attached yet.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </AgentAppShell>
  );
}

export default function AgentProjectClient() {
  return (
    <Suspense
      fallback={
        <AgentAppShell title="Project detail" subtitle="Loading project…">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            Loading project…
          </div>
        </AgentAppShell>
      }
    >
      <ProjectDetailInner />
    </Suspense>
  );
}
