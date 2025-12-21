// app/internal/agent-handoffs/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "../_components/ConfirmModal";

type Handoff = {
  id: number;
  token: string;
  handoff_type: string;
  context: string;
  whatsapp_number: string;

  customer_name?: string | null;
  customer_email?: string | null;

  status: string;
  created_at: string;

  claimed_by?: string;
  claimed_at?: string | null;

  manufacturer_found_at?: string | null;
  paid_at?: string | null;

  shipped_at?: string | null;
  shipper?: string | null;
  tracking_number?: string | null;

  delivered_at?: string | null;

  cancelled_at?: string | null;
  cancel_reason?: string | null;
};

type MeResponse =
  | {
      ok: true;
      user: {
        username: string;
        role: string;
        permissions: { can_view_leads: boolean; can_view_handoffs: boolean };
      };
    }
  | { ok: false; error: string };

type NextAction = "claim" | "manufacturer_found" | "payment" | "shipped" | "delivered" | "cancelled";

type PaymentPurpose = "downpayment" | "full_payment" | "shipping_payment" | "additional_payment";

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

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
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

function allowedNextActions(h: Handoff): NextAction[] {
  const s = (h.status || "").toLowerCase();

  if (s === "pending" && !h.claimed_by) return ["claim", "cancelled"];
  if (s === "claimed") return ["manufacturer_found", "cancelled"];

  // Manufacturer found and beyond: allow payment logging any time
  if (s === "manufacturer_found") return ["payment", "cancelled"];
  if (s === "paid") return ["payment", "shipped", "cancelled"];
  if (s === "shipped") return ["payment", "delivered", "cancelled"];
  if (s === "delivered") return ["payment"]; // allow more payments even after delivery

  return [];
}

function actionLabel(a: NextAction) {
  if (a === "claim") return "Claim";
  if (a === "manufacturer_found") return "Manufacturer Found";
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

const btnBase =
  "inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors border";
const btnPrimary = `${btnBase} bg-white text-neutral-950 border-white hover:bg-neutral-200`;
const btnSecondary = `${btnBase} border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700`;
const btnDanger = `${btnBase} border-red-700/60 bg-red-500/10 text-red-200 hover:bg-red-500/15`;

export default function AgentHandoffsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // payment summaries keyed by handoff id
  const [paySummary, setPaySummary] = useState<Record<number, PaymentSummary>>({});

  // Update modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalHandoff, setModalHandoff] = useState<Handoff | null>(null);
  const [modalAction, setModalAction] = useState<NextAction | "">("");
  const [shipper, setShipper] = useState("");
  const [tracking, setTracking] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  // Cancel confirmation
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentHandoff, setPaymentHandoff] = useState<Handoff | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payPurpose, setPayPurpose] = useState<PaymentPurpose>("downpayment");
  const [payNote, setPayNote] = useState<string>("");
  const [totalDueInput, setTotalDueInput] = useState<string>(""); // only requested if total_due is 0

  // Payment confirm (optional)
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadMe() {
      try {
        const res = await fetch("/internal/auth/me", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (alive && data) setMe(data);
      } catch {
        if (alive) setMe({ ok: false, error: "Failed to load session" });
      }
    }

    async function loadHandoffs() {
      try {
        const res = await fetch("/api/linescout-handoffs", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.error || "Failed to load handoffs");
        if (alive) setHandoffs(data.handoffs || []);
      } catch (e: any) {
        if (alive) setBanner({ type: "err", msg: e.message || "Error loading handoffs" });
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadMe();
    loadHandoffs();

    const interval = setInterval(loadHandoffs, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // Load payment summaries whenever handoffs list changes
  useEffect(() => {
    let alive = true;

    async function loadSummaries() {
      if (!handoffs.length) return;
      try {
        const ids = handoffs.map((h) => h.id);

        // fetch sequentially to avoid hammering; still fine for admin scale
        for (const id of ids) {
          const res = await fetch(`/api/linescout-handoffs/payments?handoffId=${id}`, { cache: "no-store" });
          const data = (await res.json().catch(() => null)) as PaymentSummaryResponse | null;
          if (!alive || !data) continue;
          if ("ok" in data && data.ok) {
            setPaySummary((prev) => ({
              ...prev,
              [id]: {
                currency: data.financials.currency,
                total_due: Number(data.financials.total_due || 0),
                total_paid: Number(data.financials.total_paid || 0),
                balance: Number(data.financials.balance || 0),
              },
            }));
          }
        }
      } catch {
        // ignore summary errors, page remains usable
      }
    }

    loadSummaries();
    return () => {
      alive = false;
    };
  }, [handoffs]);

  const agentUsername = useMemo(() => {
    return me && "ok" in me && me.ok ? me.user.username : "";
  }, [me]);

  function openUpdateModal(h: Handoff) {
    setBanner(null);
    setModalHandoff(h);
    setModalOpen(true);

    const allowed = allowedNextActions(h);
    setModalAction(allowed[0] ?? "");
    setShipper("");
    setTracking("");
    setCancelReason("");
  }

  function closeUpdateModal() {
    setModalOpen(false);
    setModalHandoff(null);
    setModalAction("");
    setShipper("");
    setTracking("");
    setCancelReason("");
  }

  async function claim(id: number) {
    if (!agentUsername) {
      setBanner({ type: "err", msg: "Could not identify signed-in agent. Sign out and sign in again." });
      return;
    }

    setBusyId(id);
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
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to claim handoff." });
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(id: number, status: string, extra: Record<string, string> = {}) {
    setBusyId(id);
    setBanner(null);
    try {
      const res = await fetch("/api/linescout-handoffs/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, ...extra }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to update status");

      setBanner({ type: "ok", msg: "Status updated." });
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to update status." });
      throw e;
    } finally {
      setBusyId(null);
    }
  }

  function openPayment(h: Handoff) {
    setBanner(null);
    setPaymentHandoff(h);
    setPaymentOpen(true);
    setPayAmount("");
    setPayPurpose("downpayment");
    setPayNote("");

    const summary = paySummary[h.id];
    // only require Total Due when not set yet (0)
    setTotalDueInput(summary && summary.total_due > 0 ? "" : "");
  }

  function closePayment() {
    setPaymentOpen(false);
    setPaymentHandoff(null);
    setPayAmount("");
    setPayPurpose("downpayment");
    setPayNote("");
    setTotalDueInput("");
    setPaymentConfirmOpen(false);
  }

  async function refreshPaymentSummary(handoffId: number) {
    try {
      const res = await fetch(`/api/linescout-handoffs/payments?handoffId=${handoffId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as PaymentSummaryResponse | null;
      if (!data || !("ok" in data) || !data.ok) return;

      setPaySummary((prev) => ({
        ...prev,
        [handoffId]: {
          currency: data.financials.currency,
          total_due: Number(data.financials.total_due || 0),
          total_paid: Number(data.financials.total_paid || 0),
          balance: Number(data.financials.balance || 0),
        },
      }));
    } catch {
      // ignore
    }
  }

  async function submitPayment() {
    if (!paymentHandoff) return;

    const hid = paymentHandoff.id;
    const amt = Number(String(payAmount).replace(/,/g, "").trim());

    if (!amt || amt <= 0) {
      setBanner({ type: "err", msg: "Enter a valid amount." });
      return;
    }

    const current = paySummary[hid];
    const totalDue = current?.total_due ?? 0;

    // if total_due not set yet, force it now
    if (!totalDue || totalDue <= 0) {
      const td = Number(String(totalDueInput).replace(/,/g, "").trim());
      if (!td || td <= 0) {
        setBanner({ type: "err", msg: "Total amount due is required the first time you record payment." });
        return;
      }
    }

    // open confirm modal (nice UX)
    setPaymentConfirmOpen(true);
  }

  async function confirmPayment() {
    if (!paymentHandoff) return;

    const hid = paymentHandoff.id;
    const amt = Number(String(payAmount).replace(/,/g, "").trim());
    const current = paySummary[hid];
    const totalDueExisting = current?.total_due ?? 0;

    const payload: any = {
      handoffId: hid,
      amount: amt,
      purpose: payPurpose,
      currency: (current?.currency || "NGN") as string,
      note: payNote.trim(),
    };

    if (!totalDueExisting || totalDueExisting <= 0) {
      const td = Number(String(totalDueInput).replace(/,/g, "").trim());
      payload.totalDue = td;
    }

    setBusyId(hid);
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

      // optional: if this is “full payment” or balance <= 0, mark status paid (business choice)
      // We keep status separate; you can decide later if you want auto-status updates.

      await refreshPaymentSummary(hid);
      closePayment();
    } catch (e: any) {
      setBanner({ type: "err", msg: e.message || "Failed to record payment." });
      setPaymentConfirmOpen(false);
    } finally {
      setBusyId(null);
    }
  }

  async function submitUpdate() {
    if (!modalHandoff || !modalAction) return;

    const h = modalHandoff;
    const id = h.id;

    const allowed = allowedNextActions(h);
    if (!allowed.includes(modalAction as NextAction)) {
      setBanner({ type: "err", msg: "That action is no longer valid. Refreshing list…" });
      closeUpdateModal();
      return;
    }

    try {
      if (modalAction === "payment") {
        closeUpdateModal();
        openPayment(h);
        return;
      }

      if (modalAction === "claim") {
        await claim(id);
        closeUpdateModal();
        return;
      }

      if (modalAction === "shipped") {
        const s = shipper.trim();
        const t = tracking.trim();
        if (!s || !t) {
          setBanner({ type: "err", msg: "Shipper and tracking/reference are required." });
          return;
        }
        await updateStatus(id, "shipped", { shipper: s, tracking_number: t });
        closeUpdateModal();
        return;
      }

      if (modalAction === "cancelled") {
        const r = cancelReason.trim();
        if (!r) {
          setBanner({ type: "err", msg: "Cancellation reason is required." });
          return;
        }
        setCancelConfirmOpen(true);
        return;
      }

      await updateStatus(id, modalAction);
      closeUpdateModal();
    } catch {
      // banner already set
    }
  }

  async function confirmCancel() {
    if (!modalHandoff) return;
    const id = modalHandoff.id;
    const r = cancelReason.trim();

    try {
      await updateStatus(id, "cancelled", { cancel_reason: r });
      setCancelConfirmOpen(false);
      closeUpdateModal();
    } catch {
      setCancelConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Handoffs</h2>
          <p className="text-sm text-neutral-400">Claim and progress handoffs through sourcing milestones.</p>
        </div>

        <div className="text-xs text-neutral-400">{agentUsername ? `Signed in as ${agentUsername}` : ""}</div>
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

      {loading && <p className="text-sm text-neutral-400">Loading handoffs...</p>}

      {!loading && handoffs.length === 0 ? <p className="text-sm text-neutral-400">No handoffs yet.</p> : null}

      {!loading && handoffs.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/70 text-neutral-300">
              <tr>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Created</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Customer</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Email</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Token</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Context</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">WhatsApp</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Owner</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Status</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Milestones</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Payments</th>
                <th className="border-b border-neutral-800 px-3 py-2 text-left">Action</th>
              </tr>
            </thead>

            <tbody className="bg-neutral-950">
              {handoffs.map((h) => {
                const disabled = busyId === h.id;
                const allowed = allowedNextActions(h);
                const ps = paySummary[h.id];

                return (
                  <tr key={h.id} className="border-t border-neutral-800 hover:bg-neutral-900/40 align-top">
                    <td className="px-3 py-3 text-xs text-neutral-300">{fmt(h.created_at)}</td>

                    <td className="px-3 py-3">
                      <div className="font-medium text-neutral-100">{h.customer_name || "N/A"}</div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300">
                      {h.customer_email || "N/A"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-neutral-100">{h.token}</div>
                      <div className="mt-1 text-[11px] text-neutral-500">{h.handoff_type}</div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="text-neutral-100">{h.context}</div>
                    </td>

                    <td className="px-3 py-3 text-xs text-neutral-300">{h.whatsapp_number || "N/A"}</td>

                    <td className="px-3 py-3 text-xs text-neutral-300">
                      <div className="text-neutral-100">{h.claimed_by || "Unclaimed"}</div>
                      <div className="text-neutral-500">{h.claimed_at ? fmt(h.claimed_at) : "N/A"}</div>
                    </td>

                    <td className="px-3 py-3">
                      <span className={badge(h.status)}>{h.status}</span>
                    </td>

                    <td className="px-3 py-3">
                      <div className="space-y-1 text-[11px] text-neutral-400">
                        <div>
                          <span className="text-neutral-500">Manufacturer:</span> {fmt(h.manufacturer_found_at)}
                        </div>
                        <div>
                          <span className="text-neutral-500">Shipped:</span> {fmt(h.shipped_at)}
                        </div>
                        {h.shipped_at ? (
                          <div className="text-[11px] text-neutral-400">
                            <span className="text-neutral-500">Shipper:</span> {h.shipper || "N/A"}
                            <br />
                            <span className="text-neutral-500">Tracking:</span> {h.tracking_number || "N/A"}
                          </div>
                        ) : null}
                        <div>
                          <span className="text-neutral-500">Delivered:</span> {fmt(h.delivered_at)}
                        </div>
                        {h.cancelled_at ? (
                          <div className="text-[11px] text-red-300/90">
                            <span className="text-red-300/70">Cancelled:</span> {fmt(h.cancelled_at)}
                            <br />
                            <span className="text-red-300/70">Reason:</span> {h.cancel_reason || "N/A"}
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {ps ? (
                        <div className="space-y-1 text-[11px]">
                          <div className="text-neutral-400">
                            <span className="text-neutral-500">Due:</span>{" "}
                            <span className="text-neutral-200">{fmtMoney(ps.total_due, ps.currency)}</span>
                          </div>
                          <div className="text-neutral-400">
                            <span className="text-neutral-500">Paid:</span>{" "}
                            <span className="text-neutral-200">{fmtMoney(ps.total_paid, ps.currency)}</span>
                          </div>
                          <div className="text-neutral-400">
                            <span className="text-neutral-500">Balance:</span>{" "}
                            <span className={ps.balance <= 0 ? "text-emerald-200" : "text-amber-200"}>
                              {fmtMoney(ps.balance, ps.currency)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-500">Loading…</div>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {allowed.length === 0 ? (
                        <div className="text-xs text-neutral-500">No actions</div>
                      ) : (
                        <button
                          onClick={() => openUpdateModal(h)}
                          disabled={disabled}
                          className={`${btnSecondary} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {disabled ? "Working..." : "Update"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="px-3 py-3 text-xs text-neutral-500">Tip: This dashboard refreshes every 5 seconds.</div>
        </div>
      ) : null}

      {/* Update Modal */}
      {modalOpen && modalHandoff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Update handoff</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Token <span className="text-neutral-200 font-semibold">{modalHandoff.token}</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">Current status: {modalHandoff.status}</p>
              </div>

              <button
                onClick={closeUpdateModal}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs text-neutral-400">Action</label>
              <select
                value={modalAction}
                onChange={(e) => {
                  setBanner(null);
                  setModalAction(e.target.value as any);
                  setShipper("");
                  setTracking("");
                  setCancelReason("");
                }}
                className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              >
                {allowedNextActions(modalHandoff).map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
              </select>
            </div>

            {modalAction === "shipped" ? (
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

            {modalAction === "cancelled" ? (
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

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-xs text-neutral-500">Only valid next steps are shown.</div>

              <div className="flex items-center gap-2">
                <button onClick={closeUpdateModal} className={btnSecondary}>
                  Cancel
                </button>

                <button
                  onClick={submitUpdate}
                  className={`${modalAction === "cancelled" ? btnDanger : btnPrimary} ${
                    busyId === modalHandoff.id ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  disabled={busyId === modalHandoff.id}
                >
                  {busyId === modalHandoff.id ? "Saving..." : modalAction === "payment" ? "Continue" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Payment Modal */}
      {paymentOpen && paymentHandoff ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Record payment</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  Token <span className="text-neutral-200 font-semibold">{paymentHandoff.token}</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Add payments as they come in. This supports multiple payments per handoff.
                </p>
              </div>

              <button
                onClick={closePayment}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
              >
                Close
              </button>
            </div>

            {(() => {
              const ps = paySummary[paymentHandoff.id];
              const currency = ps?.currency || "NGN";
              const due = ps?.total_due || 0;

              return (
                <div className="mt-4 space-y-3">
                  {/* Total due only if not set */}
                  {due <= 0 ? (
                    <div>
                      <label className="text-xs text-neutral-400">Total amount due (required first time)</label>
                      <input
                        value={totalDueInput}
                        onChange={(e) => setTotalDueInput(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                        placeholder="1500000"
                      />
                      <div className="mt-1 text-[11px] text-neutral-500">
                        This lets us compute balance automatically for future payments.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="text-[11px] text-neutral-500">Current financials</div>
                      <div className="mt-1 text-sm text-neutral-200">
                        Due: <span className="font-semibold">{fmtMoney(ps!.total_due, currency)}</span> · Paid:{" "}
                        <span className="font-semibold">{fmtMoney(ps!.total_paid, currency)}</span> · Balance:{" "}
                        <span className={ps!.balance <= 0 ? "font-semibold text-emerald-200" : "font-semibold text-amber-200"}>
                          {fmtMoney(ps!.balance, currency)}
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
                      <select
                        value={payPurpose}
                        onChange={(e) => setPayPurpose(e.target.value as PaymentPurpose)}
                        className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                      >
                        <option value="downpayment">Downpayment</option>
                        <option value="full_payment">Full Payment</option>
                        <option value="shipping_payment">Shipping Payment</option>
                        <option value="additional_payment">Additional Payment</option>
                      </select>
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
                        className={`${btnPrimary} ${busyId === paymentHandoff.id ? "opacity-60 cursor-not-allowed" : ""}`}
                        disabled={busyId === paymentHandoff.id}
                      >
                        {busyId === paymentHandoff.id ? "Saving..." : "Continue"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Payment confirm modal */}
      <ConfirmModal
        open={paymentConfirmOpen}
        title="Record this payment?"
        description={
          paymentHandoff
            ? `You are recording a ${purposeLabel(payPurpose)} for "${paymentHandoff.token}". Continue?`
            : "Continue?"
        }
        confirmText="Yes, record"
        cancelText="Go back"
        onCancel={() => setPaymentConfirmOpen(false)}
        onConfirm={confirmPayment}
      />

      {/* Cancel confirm modal */}
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