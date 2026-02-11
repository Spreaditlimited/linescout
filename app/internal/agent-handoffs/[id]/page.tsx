"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "../../_components/SearchableSelect";
import { useParams } from "next/navigation";
import ConfirmModal from "../../_components/ConfirmModal";

type Handoff = {
  id: number;
  token: string;
  handoff_type: string;
  context: string | null;
  whatsapp_number: string | null;

  customer_name?: string | null;
  email?: string | null;

  status: string;
  created_at: string;

  claimed_by?: string | null;
  claimed_at?: string | null;

  manufacturer_found_at?: string | null;
  manufacturer_name?: string | null;
  manufacturer_address?: string | null;
  manufacturer_contact_name?: string | null;
  manufacturer_contact_email?: string | null;
  manufacturer_contact_phone?: string | null;
  manufacturer_details_updated_at?: string | null;
  manufacturer_details_updated_by?: number | null;
  manufacturer_audit?: Array<{
    id: number;
    changed_by_id: number | null;
    changed_by_name: string | null;
    changed_by_role: string | null;
    previous: {
      manufacturer_name: string | null;
      manufacturer_address: string | null;
      manufacturer_contact_name: string | null;
      manufacturer_contact_email: string | null;
      manufacturer_contact_phone: string | null;
    };
    next: {
      manufacturer_name: string | null;
      manufacturer_address: string | null;
      manufacturer_contact_name: string | null;
      manufacturer_contact_email: string | null;
      manufacturer_contact_phone: string | null;
    };
    created_at: string | null;
  }>;
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
  paid_at?: string | null;

  shipped_at?: string | null;
  shipper?: string | null;
  tracking_number?: string | null;

  delivered_at?: string | null;

  cancelled_at?: string | null;
  cancel_reason?: string | null;

  bank_id?: number | null;
  shipping_company_id?: number | null;
  conversation_id?: number | null;
};

type MeResponse =
  | {
      ok: true;
      user: {
        username: string;
        role: string;
        permissions: {
          can_view_leads: boolean;
          can_view_handoffs: boolean;
          can_view_analytics?: boolean;
        };
      };
    }
  | { ok: false; error: string };

type NextAction =
  | "claim"
  | "manufacturer_found"
  | "paid"
  | "payment"
  | "shipped"
  | "delivered"
  | "cancelled";

type PaymentPurpose =
  | "downpayment"
  | "full_payment"
  | "shipping_payment"
  | "additional_payment";

type PaymentSummaryResponse =
  | {
      ok: true;
      financials: {
        currency: string;
        total_due: number;
        total_paid: number;
        balance: number;
      };
      payments: Array<{
        id: number;
        amount: string;
        currency: string;
        purpose: PaymentPurpose;
        note: string | null;
        paid_at: string;
      }>;
    }
  | { ok: false; error: string };

type PaymentSummary = {
  currency: string;
  total_due: number;
  total_paid: number;
  balance: number;
};

type QuoteItem = {
  id: number;
  token: string;
  status: string;
  payment_purpose?: string | null;
  agent_note?: string | null;
  total_due_ngn?: number | null;
  created_at?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
};

type PaymentRow = {
  id: number;
  amount: string;
  currency: string;
  purpose: PaymentPurpose;
  note: string | null;
  paid_at: string;
};

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function badge(status: string) {
  const s = (status || "").toLowerCase();
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

  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

function allowedNextActions(h: Handoff, ps?: PaymentSummary): NextAction[] {
  const s = (h.status || "").toLowerCase();

  const totalDue = Number(ps?.total_due ?? 0);
  const balance = Number(ps?.balance ?? Number.POSITIVE_INFINITY);
  const hasDueSet = totalDue > 0;

  if (s === "pending" && !h.claimed_by) return ["claim", "cancelled"];
  if (s === "claimed") return ["manufacturer_found", "cancelled"];

  if (s === "manufacturer_found") {
    const actions: NextAction[] = ["payment", "cancelled"];
    if (hasDueSet && balance <= 0) actions.unshift("paid");
    return actions;
  }

  if (s === "paid") return ["payment", "shipped", "cancelled"];
  if (s === "shipped") return ["payment", "delivered", "cancelled"];
  if (s === "delivered") return ["payment"];

  return [];
}

function actionLabel(a: NextAction) {
  if (a === "claim") return "Claim";
  if (a === "manufacturer_found") return "Manufacturer Found";
  if (a === "paid") return "Mark Paid";
  if (a === "payment") return "Record Payment";
  if (a === "shipped") return "Mark Shipped";
  if (a === "delivered") return "Mark Delivered";
  if (a === "cancelled") return "Cancel";
  return a;
}

function purposeLabel(p: PaymentPurpose) {
  if (p === "downpayment") return "Downpayment";
  if (p === "full_payment") return "Full Payment";
  if (p === "shipping_payment") return "Shipping Payment";
  return "Additional Payment";
}

function fmtMoney(n: number, currency: string) {
  if (!Number.isFinite(n)) return `${currency} 0`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

function pickHandoffPayload(data: any): Handoff | null {
  if (!data) return null;
  // support multiple response shapes without guessing elsewhere
  return (data.handoff || data.item || data.data || null) as Handoff | null;
}

const btnBase =
  "inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors border";
const btnPrimary = `${btnBase} bg-white text-neutral-950 border-white hover:bg-neutral-200`;
const btnSecondary = `${btnBase} border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700`;
const btnDanger = `${btnBase} border-red-700/60 bg-red-500/10 text-red-200 hover:bg-red-500/15`;

export default function HandoffDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  const [me, setMe] = useState<MeResponse | null>(null);

  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [paySummary, setPaySummary] = useState<PaymentSummary | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);

  // Update panel state
  const [action, setAction] = useState<NextAction | "">("");
  const [shipper, setShipper] = useState("");
  const [tracking, setTracking] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [shippingReqMsg, setShippingReqMsg] = useState<string | null>(null);

  // Payment modal state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payPurpose, setPayPurpose] = useState<PaymentPurpose>("downpayment");
  const [payNote, setPayNote] = useState("");
  const [totalDueInput, setTotalDueInput] = useState("");
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);

  // Cancel confirm
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const authed = useMemo(() => !!(me && "ok" in me && me.ok), [me]);
  const user = authed ? (me as any).user : null;

  const agentUsername = user?.username || "";
  const isAdmin = String(user?.role || "") === "admin";
  const canHandoffs = !!(isAdmin || user?.permissions?.can_view_handoffs);

  async function loadMe() {
    try {
      const res = await fetch("/internal/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as MeResponse | null;
      if (data) setMe(data);
    } catch {
      setMe({ ok: false, error: "Failed to load session" });
    }
  }

  async function loadQuotesOnce(): Promise<QuoteItem[]> {
    const res = await fetch(`/api/internal/quotes?handoff_id=${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return [];
    return (data.items || []) as QuoteItem[];
  }

  async function loadPaymentsOnce(): Promise<{
    summary: PaymentSummary | null;
    payments: PaymentRow[];
  }> {
    if (!Number.isFinite(id) || id <= 0) return { summary: null, payments: [] };

    try {
      const res = await fetch(`/api/linescout-handoffs/payments?handoffId=${id}`, {
        cache: "no-store",
      });

      const data = (await res.json().catch(() => null)) as PaymentSummaryResponse | null;
      if (!data || !("ok" in data) || !data.ok) return { summary: null, payments: [] };

      const summary: PaymentSummary = {
        currency: data.financials.currency,
        total_due: Number(data.financials.total_due || 0),
        total_paid: Number(data.financials.total_paid || 0),
        balance: Number(data.financials.balance || 0),
      };

      return { summary, payments: (data.payments || []) as PaymentRow[] };
    } catch {
      return { summary: null, payments: [] };
    }
  }

  async function loadHandoffOnce(ps?: PaymentSummary | null): Promise<Handoff | null> {
    if (!Number.isFinite(id) || id <= 0) return null;

    const res = await fetch(`/api/internal/handoffs/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to load handoff");
    }

    const h = pickHandoffPayload(data);
    if (!h) throw new Error("Handoff payload missing from API response");

    // set default action based on the *latest* summary we passed in
    const allowed = allowedNextActions(h, ps || undefined);
    setAction((prev) => (prev ? prev : allowed[0] ?? ""));

    return h;
  }

  async function refreshAll(showBanner = false) {
    if (!Number.isFinite(id) || id <= 0) return;

    setBanner(null);
    setLoading(true);

    try {
      const { summary, payments } = await loadPaymentsOnce();
      setPaySummary(summary);
      setPayments(payments);

      const h = await loadHandoffOnce(summary);
      setHandoff(h);

      const qs = await loadQuotesOnce();
      setQuotes(qs);

      if (showBanner) setBanner({ type: "ok", msg: "Refreshed." });
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to refresh" });
      setHandoff(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function claim() {
    if (!agentUsername) {
      setBanner({ type: "err", msg: "No signed-in user detected. Sign out and sign in again." });
      return;
    }

    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/linescout-handoffs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, agent: agentUsername }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Could not claim this handoff.");

      setBanner({ type: "ok", msg: "Handoff claimed." });
      await refreshAll(false);
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to claim handoff." });
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status: string, extra: Record<string, any> = {}) {
    setBusy(true);
    setBanner(null);

    try {
      const payload: Record<string, any> = { id, status, ...extra };

      if (status === "shipped") {
        const s = String(payload.shipper ?? shipper).trim();
        const t = String(payload.tracking_number ?? tracking).trim();
        if (!s) throw new Error("Shipper is required.");
        if (!t) throw new Error("Tracking/Reference is required.");
        payload.shipper = s;
        payload.tracking_number = t;
      }

      const res = await fetch("/api/linescout-handoffs/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to update status");

      setBanner({ type: "ok", msg: "Status updated." });
      await refreshAll(false);
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to update status." });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function requestShippingPayment() {
    if (!handoff) return;
    try {
      setBusy(true);
      setShippingReqMsg(null);
      const res = await fetch(`/api/internal/handoffs/${handoff.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_shipping_payment" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to request shipping payment.");
      }
      setShippingReqMsg(
        `Shipping payment request sent. Amount due: NGN ${Number(data.amount_due || 0).toLocaleString()}`
      );
    } catch (e: any) {
      setShippingReqMsg(e?.message || "Failed to request shipping payment.");
    } finally {
      setBusy(false);
    }
  }

  function openPayment() {
    setBanner(null);
    setPaymentOpen(true);
    setPayAmount("");
    setPayPurpose("downpayment");
    setPayNote("");
    setTotalDueInput("");
    setPaymentConfirmOpen(false);
  }

  function closePayment() {
    setPaymentOpen(false);
    setPayAmount("");
    setPayNote("");
    setTotalDueInput("");
    setPaymentConfirmOpen(false);
  }

  async function submitPayment() {
    const amt = Number(String(payAmount).replace(/,/g, "").trim());
    if (!amt || amt <= 0) {
      setBanner({ type: "err", msg: "Enter a valid amount." });
      return;
    }

    const totalDueExisting = paySummary?.total_due ?? 0;
    if (!totalDueExisting || totalDueExisting <= 0) {
      const td = Number(String(totalDueInput).replace(/,/g, "").trim());
      if (!td || td <= 0) {
        setBanner({ type: "err", msg: "Total amount due is required the first time." });
        return;
      }
    }

    setPaymentConfirmOpen(true);
  }

  async function confirmPayment() {
    const amt = Number(String(payAmount).replace(/,/g, "").trim());
    const totalDueExisting = paySummary?.total_due ?? 0;

    const payload: any = {
      handoffId: id,
      amount: amt,
      purpose: payPurpose,
      currency: (paySummary?.currency || "NGN") as string,
      note: payNote.trim(),
    };

    if (!totalDueExisting || totalDueExisting <= 0) {
      payload.totalDue = Number(String(totalDueInput).replace(/,/g, "").trim());
    }

    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/linescout-handoffs/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to record payment");

      setBanner({ type: "ok", msg: "Payment recorded." });
      closePayment();
      await refreshAll(false);
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to record payment." });
      setPaymentConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function submitAction() {
    if (!handoff || !action) return;

    const allowed = allowedNextActions(handoff, paySummary || undefined);
    if (!allowed.includes(action as NextAction)) {
      setBanner({ type: "err", msg: "That action is no longer valid. Refreshing…" });
      await refreshAll(false);
      return;
    }

    if (!canHandoffs) {
      setBanner({ type: "err", msg: "Forbidden." });
      return;
    }

    if (action === "payment") {
      openPayment();
      return;
    }

    if (action === "claim") {
      await claim();
      return;
    }

    if (action === "cancelled") {
      const r = cancelReason.trim();
      if (!r) {
        setBanner({ type: "err", msg: "Cancellation reason is required." });
        return;
      }
      setCancelConfirmOpen(true);
      return;
    }

    if (action === "shipped") {
      const s = shipper.trim();
      const t = tracking.trim();
      if (!s || !t) {
        setBanner({ type: "err", msg: "Shipper and tracking/reference are required." });
        return;
      }
      await updateStatus("shipped", { shipper: s, tracking_number: t });
      return;
    }

    await updateStatus(action);
  }

  async function confirmCancel() {
    const r = cancelReason.trim();
    await updateStatus("cancelled", { cancel_reason: r });
    setCancelConfirmOpen(false);
  }

  if (authed && !canHandoffs) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm text-neutral-200">Forbidden</div>
        <div className="mt-1 text-xs text-neutral-500">You don’t have access to handoffs.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/internal/agent-handoffs"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
            >
              ← Back
            </Link>

            {handoff ? <span className="text-xs text-neutral-500">Handoff #{handoff.id}</span> : null}
          </div>

          <h2 className="mt-3 text-lg font-semibold text-neutral-100">{handoff?.token || "Handoff"}</h2>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {handoff ? <span className={badge(handoff.status)}>{handoff.status}</span> : null}
            {handoff?.handoff_type ? (
              <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-neutral-200">
                {handoff.handoff_type}
              </span>
            ) : null}
          </div>
        </div>

        <button
          onClick={() => refreshAll(true)}
          className={btnSecondary}
          disabled={busy || loading}
        >
          Refresh
        </button>
      </div>

      {banner ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            banner.type === "ok"
              ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
              : "border-red-900/50 bg-red-950/30 text-red-200"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {loading ? <div className="text-sm text-neutral-400">Loading…</div> : null}

      {!loading && !handoff ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          Handoff not found.
        </div>
      ) : null}

      {handoff ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Left */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">Customer</div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-neutral-500">Name</div>
                  <div className="text-sm text-neutral-200">{handoff.customer_name || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Email</div>
                  <div className="text-sm text-neutral-200">{handoff.email || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">WhatsApp</div>
                  <div className="text-sm text-neutral-200">{handoff.whatsapp_number || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Created</div>
                  <div className="text-sm text-neutral-200">{fmt(handoff.created_at)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-100">Project brief</div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(handoff.context || "");
                    setBanner({ type: "ok", msg: "Brief copied." });
                  }}
                  className="text-xs font-semibold text-neutral-200 hover:text-white"
                >
                  Copy
                </button>
              </div>

              <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                {handoff.context || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-100">Manufacturer details</div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                  {handoff.manufacturer_details_updated_at ? (
                    <span>
                      Updated: {fmt(handoff.manufacturer_details_updated_at)}
                      {handoff.manufacturer_audit?.[0]?.changed_by_name
                        ? ` · ${handoff.manufacturer_audit[0].changed_by_name}`
                        : ""}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const payload = [
                        `Company: ${handoff.manufacturer_name || "N/A"}`,
                        `Address: ${handoff.manufacturer_address || "N/A"}`,
                        `Contact: ${handoff.manufacturer_contact_name || "N/A"}`,
                        `Email: ${handoff.manufacturer_contact_email || "N/A"}`,
                        `Phone: ${handoff.manufacturer_contact_phone || "N/A"}`,
                      ].join("\n");
                      navigator.clipboard.writeText(payload);
                      setBanner({ type: "ok", msg: "Manufacturer details copied." });
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:text-white"
                  >
                    Copy details
                  </button>
                </div>
              </div>

              {handoff.manufacturer_name ? (
                <div className="mt-3 space-y-3 text-sm text-neutral-200">
                  <div>
                    <div className="text-xs text-neutral-500">Company</div>
                    <div className="text-sm text-neutral-200">{handoff.manufacturer_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Address</div>
                    <div className="text-sm text-neutral-200 whitespace-pre-wrap break-words">
                      {handoff.manufacturer_address || "N/A"}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-neutral-500">Contact person</div>
                      <div className="text-sm text-neutral-200">{handoff.manufacturer_contact_name || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500">Phone</div>
                      <div className="text-sm text-neutral-200">{handoff.manufacturer_contact_phone || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500">Email</div>
                      <div className="text-sm text-neutral-200">{handoff.manufacturer_contact_email || "N/A"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-neutral-500">No manufacturer details yet.</div>
              )}

              {handoff.manufacturer_audit?.length ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-neutral-300">Audit trail</div>
                  <div className="mt-2 space-y-2">
                    {handoff.manufacturer_audit.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-xs text-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                          <span>{entry.changed_by_name || "System"}</span>
                          {entry.changed_by_role ? <span>· {entry.changed_by_role}</span> : null}
                          {entry.created_at ? <span>· {fmt(entry.created_at)}</span> : null}
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] text-neutral-500">Previous</div>
                            <div className="text-neutral-200">
                              {entry.previous?.manufacturer_name || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.previous?.manufacturer_address || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.previous?.manufacturer_contact_name || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.previous?.manufacturer_contact_email || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.previous?.manufacturer_contact_phone || "N/A"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-neutral-500">New</div>
                            <div className="text-neutral-200">
                              {entry.next?.manufacturer_name || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.next?.manufacturer_address || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.next?.manufacturer_contact_name || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.next?.manufacturer_contact_email || "N/A"}
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {entry.next?.manufacturer_contact_phone || "N/A"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">Release audit</div>
              {handoff.release_audit?.length ? (
                <div className="mt-3 space-y-2">
                  {handoff.release_audit.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-xs text-neutral-300"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                        <span>{row.created_at ? fmt(row.created_at) : "N/A"}</span>
                        {row.previous_status ? <span>· {row.previous_status}</span> : null}
                      </div>
                      <div className="mt-2 text-sm text-neutral-200">
                        Released by{" "}
                        <span className="font-semibold">
                          {row.released_by_name || `User ${row.released_by_id || "N/A"}`}
                        </span>
                        {row.released_by_role ? ` (${row.released_by_role})` : ""}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-neutral-500 sm:grid-cols-2">
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
                <div className="mt-2 text-xs text-neutral-500">No release activity recorded.</div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-100">Quotes</div>
                <Link
                  href={"/internal/settings"}
                  className="text-xs font-semibold text-neutral-400 hover:text-neutral-100"
                >
                  Manage settings
                </Link>
              </div>

              {quotes.length ? (
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-200">
                    <div className="text-neutral-400">Latest quote summary</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-emerald-200">
                        {fmtMoney(Number(quotes[0].total_due_ngn || 0), "NGN")}
                      </span>
                      <span className="text-neutral-500">· {quotes[0].payment_purpose || "payment"}</span>
                    </div>
                  </div>
                  {quotes.map((q) => (
                    <div
                      key={q.id}
                      className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-200 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-semibold">Quote #{q.id}</div>
                        <div className="text-neutral-400">
                          {q.payment_purpose || "payment"} · {q.created_by_name || "Agent"}
                        </div>
                        {String(q.agent_note || "").trim() ? (
                          <div className="mt-1 max-w-xl whitespace-pre-line text-neutral-300">
                            Note: {String(q.agent_note || "").trim()}
                          </div>
                        ) : null}
                        {q.created_at ? (
                          <div className="text-neutral-500">{fmt(q.created_at)}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-200 font-semibold">
                          {fmtMoney(Number(q.total_due_ngn || 0), "NGN")}
                        </span>
                        <Link
                          href={`/internal/quotes/${q.id}`}
                          className="rounded-lg border border-neutral-800 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-700"
                        >
                          Edit
                        </Link>
                        <a
                          href={`/quote/${q.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-neutral-800 px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:border-neutral-700"
                        >
                          Open link
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">No quotes yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">Payments</div>

              {paySummary ? (
                <div className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="text-[11px] text-neutral-500">Current financials</div>
                  <div className="mt-1 text-sm text-neutral-200">
                    Due:{" "}
                    <span className="font-semibold">
                      {fmtMoney(paySummary.total_due, paySummary.currency)}
                    </span>{" "}
                    · Paid:{" "}
                    <span className="font-semibold">
                      {fmtMoney(paySummary.total_paid, paySummary.currency)}
                    </span>{" "}
                    · Balance:{" "}
                    <span
                      className={
                        paySummary.balance <= 0
                          ? "font-semibold text-emerald-200"
                          : "font-semibold text-amber-200"
                      }
                    >
                      {fmtMoney(paySummary.balance, paySummary.currency)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">No payment summary yet.</div>
              )}

              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/70 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Date</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Amount</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Purpose</th>
                      <th className="px-3 py-2 text-left border-b border-neutral-800">Note</th>
                    </tr>
                  </thead>
                  <tbody className="bg-neutral-950">
                    {payments.length ? (
                      payments.map((p) => (
                        <tr key={p.id} className="border-t border-neutral-800">
                          <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                            {fmt(p.paid_at)}
                          </td>
                          <td className="px-3 py-3 text-neutral-200 whitespace-nowrap">
                            {p.currency} {Number(String(p.amount || 0)).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-xs text-neutral-300 whitespace-nowrap">
                            {purposeLabel(p.purpose)}
                          </td>
                          <td className="px-3 py-3 text-xs text-neutral-300">{p.note || "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-neutral-800">
                        <td colSpan={4} className="px-3 py-4 text-sm text-neutral-500">
                          No payments yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <button onClick={openPayment} className={btnSecondary} disabled={busy}>
                  Record payment
                </button>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">Operations</div>
              <div className="mt-1 text-xs text-neutral-500">
                Owner: <span className="text-neutral-200">{handoff.claimed_by || "Unclaimed"}</span>{" "}
                · Claimed:{" "}
                <span className="text-neutral-200">
                  {handoff.claimed_at ? fmt(handoff.claimed_at) : "N/A"}
                </span>
              </div>

              <div className="mt-4">
                <label className="text-xs text-neutral-400">Next action</label>
                <SearchableSelect
                  className="mt-2"
                  value={action}
                  options={[
                    { value: "", label: "Select" },
                    ...allowedNextActions(handoff, paySummary || undefined).map((a) => ({
                      value: a,
                      label: actionLabel(a),
                    })),
                  ]}
                  onChange={(next) => {
                    setBanner(null);
                    setAction(next as any);
                    setShipper("");
                    setTracking("");
                    setCancelReason("");
                  }}
                />
              </div>

              {action === "shipped" ? (
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-neutral-400">Shipper</label>
                    <input
                      value={shipper}
                      onChange={(e) => setShipper(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                      placeholder="Sure Imports Sea Freight"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400">Tracking / Reference</label>
                    <input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                      placeholder="Tracking number"
                    />
                  </div>
                </div>
              ) : null}

              {action === "cancelled" ? (
                <div className="mt-4">
                  <label className="text-xs text-neutral-400">Cancellation reason</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="mt-2 w-full min-h-[90px] resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-600"
                    placeholder="Explain why this was cancelled"
                  />
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-500">Only valid next steps are shown.</div>
                <button
                  onClick={submitAction}
                  disabled={busy || !action}
                  className={`${action === "cancelled" ? btnDanger : btnPrimary} ${
                    busy || !action ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {busy ? "Saving..." : action === "payment" ? "Continue" : "Confirm"}
                </button>
              </div>

              {isAdmin && handoff.status?.toLowerCase() === "shipped" ? (
                <div className="mt-4">
                  <button
                    onClick={requestShippingPayment}
                    disabled={busy}
                    className={`${btnSecondary} ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    Request shipping payment
                  </button>
                  {shippingReqMsg ? (
                    <div className="mt-2 text-xs text-neutral-400">{shippingReqMsg}</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">Milestones</div>
              <div className="mt-3 space-y-2 text-xs text-neutral-300">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Manufacturer found</span>
                  <span>{fmt(handoff.manufacturer_found_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Paid</span>
                  <span>{fmt(handoff.paid_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Shipped</span>
                  <span>{fmt(handoff.shipped_at)}</span>
                </div>

                {handoff.shipped_at ? (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-300">
                    <div>
                      <span className="text-neutral-500">Shipper:</span> {handoff.shipper || "N/A"}
                    </div>
                    <div>
                      <span className="text-neutral-500">Tracking:</span> {handoff.tracking_number || "N/A"}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Delivered</span>
                  <span>{fmt(handoff.delivered_at)}</span>
                </div>

                {handoff.cancelled_at ? (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-[11px] text-red-200">
                    <div>
                      <span className="text-red-200/70">Cancelled:</span> {fmt(handoff.cancelled_at)}
                    </div>
                    <div>
                      <span className="text-red-200/70">Reason:</span> {handoff.cancel_reason || "N/A"}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Payment modal */}
      {paymentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Record payment</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Token <span className="text-neutral-200 font-semibold">{handoff?.token}</span>
                </p>
              </div>

              <button onClick={closePayment} className={btnSecondary}>
                Close
              </button>
            </div>

            {(() => {
              const currency = paySummary?.currency || "NGN";
              const due = paySummary?.total_due || 0;

              return (
                <div className="mt-4 space-y-3">
                  {due <= 0 ? (
                    <div>
                      <label className="text-xs text-neutral-400">
                        Total amount due (required first time)
                      </label>
                      <input
                        value={totalDueInput}
                        onChange={(e) => setTotalDueInput(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                        placeholder="1500000"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="text-[11px] text-neutral-500">Current financials</div>
                      <div className="mt-1 text-sm text-neutral-200">
                        Due:{" "}
                        <span className="font-semibold">
                          {fmtMoney(paySummary!.total_due, currency)}
                        </span>{" "}
                        · Paid:{" "}
                        <span className="font-semibold">
                          {fmtMoney(paySummary!.total_paid, currency)}
                        </span>{" "}
                        · Balance:{" "}
                        <span
                          className={
                            paySummary!.balance <= 0
                              ? "font-semibold text-emerald-200"
                              : "font-semibold text-amber-200"
                          }
                        >
                          {fmtMoney(paySummary!.balance, currency)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-neutral-400">Amount</label>
                      <input
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                        placeholder="500000"
                      />
                      <div className="mt-1 text-[11px] text-neutral-500">Currency: {currency}</div>
                    </div>

                    <div>
                      <label className="text-xs text-neutral-400">Purpose</label>
                      <SearchableSelect
                        className="mt-2"
                        value={payPurpose}
                        options={[
                          { value: "downpayment", label: "Downpayment" },
                          { value: "full_payment", label: "Full Payment" },
                          { value: "shipping_payment", label: "Shipping Payment" },
                          { value: "additional_payment", label: "Additional Payment" },
                        ]}
                        onChange={(next) => setPayPurpose(next as PaymentPurpose)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-neutral-400">Note (optional)</label>
                    <input
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                      placeholder="e.g., customer paid via transfer"
                    />
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="text-xs text-neutral-500">We’ll compute totals automatically.</div>

                    <div className="flex items-center gap-2">
                      <button onClick={closePayment} className={btnSecondary}>
                        Cancel
                      </button>
                      <button
                        onClick={submitPayment}
                        className={`${btnPrimary} ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
                        disabled={busy}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={paymentConfirmOpen}
        title="Record this payment?"
        description={
          handoff
            ? `You are recording a ${purposeLabel(payPurpose)} for "${handoff.token}". Continue?`
            : "Continue?"
        }
        confirmText="Yes, record"
        cancelText="Go back"
        onCancel={() => setPaymentConfirmOpen(false)}
        onConfirm={confirmPayment}
      />

      <ConfirmModal
        open={cancelConfirmOpen}
        title="Cancel this handoff?"
        description="This will mark the handoff as cancelled and record the reason. Continue?"
        confirmText="Yes, cancel"
        cancelText="Go back"
        danger
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
