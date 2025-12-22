"use client";

import { useEffect, useMemo, useState } from "react";
import AgentsPanel from "../_components/AgentsPanel";

type MeResponse =
  | { ok: true; user: { username: string; role: string } }
  | { ok: false; error: string };

type ManualHandoffResponse =
  | {
      ok: true;
      token: string;
      handoffId: number;
      customer_email: string;
      customer_name: string | null;
      status: string;
      handoff_type: string;
      total_due: number | null;
      currency: string;
    }
  | { ok: false; error: string };

export default function InternalSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  // Modal
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ManualHandoffResponse | null>(null);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [notes, setNotes] = useState("");

  // Handoff defaults (match your DB defaults and allowed values)
  const [status, setStatus] = useState("pending");
  const [currency, setCurrency] = useState("NGN");

  // Optional financials + initial payment
  const [totalDue, setTotalDue] = useState<string>("");
  const [recordInitialPayment, setRecordInitialPayment] = useState(false);
  const [initialAmount, setInitialAmount] = useState<string>("");
  const [initialPurpose, setInitialPurpose] = useState<
    "downpayment" | "full_payment" | "shipping_payment" | "additional_payment"
  >("downpayment");
  const [initialNote, setInitialNote] = useState("");

  useEffect(() => {
    fetch("/internal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ ok: false, error: "Failed to load session" }));
  }, []);

  const isAdmin = !!(me && "ok" in me && me.ok && me.user.role === "admin");

  const canSubmit = useMemo(() => {
    const nameOk = customerName.trim().length > 0;
    const emailOk = customerEmail.trim().includes("@");
    const statusOk = status.trim().length > 0;

    if (!nameOk || !emailOk || !statusOk) return false;

    if (totalDue.trim()) {
      const td = Number(totalDue);
      if (Number.isNaN(td) || td < 0) return false;
    }

    if (recordInitialPayment) {
      const amt = Number(initialAmount);
      if (!amt || Number.isNaN(amt) || amt <= 0) return false;
    }

    return true;
  }, [customerName, customerEmail, status, totalDue, recordInitialPayment, initialAmount]);

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setWhatsApp("");
    setNotes("");
    setStatus("pending");
    setCurrency("NGN");
    setTotalDue("");
    setRecordInitialPayment(false);
    setInitialAmount("");
    setInitialPurpose("downpayment");
    setInitialNote("");
    setResult(null);
  }

  async function submitManualHandoff() {
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);

    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || null,
        whatsapp_number: whatsApp.trim() || null,
        notes: notes.trim() || null,
        status: status.trim() || "pending",
        currency: currency.trim() || "NGN",
        total_due: totalDue.trim() ? Number(totalDue) : null,
        initial_payment: recordInitialPayment
          ? {
              amount: Number(initialAmount),
              purpose: initialPurpose,
              note: initialNote.trim() || null,
            }
          : null,
      };

      const res = await fetch("/api/linescout-handoffs/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ManualHandoffResponse;
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Failed to create manual handoff" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!me) {
    return <p className="text-sm text-neutral-400">Loading...</p>;
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
        <p className="mt-1 text-sm text-neutral-400">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Admin controls: agents, access, credentials, and onboarding tools.
            </p>
          </div>

          <button
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white active:scale-[0.99]"
          >
            Create manual handoff
          </button>
        </div>
      </div>

      {/* Manual onboarding card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-100">Manual onboarding</h3>
            <p className="mt-1 text-sm text-neutral-400">
              For customers who paid via bank transfer. Creates a sourcing token (SRC-...) and a
              sourcing handoff record. Optional: set total due and record an initial payment.
            </p>
          </div>

          {/*
<div className="flex flex-col gap-2 sm:flex-row">
  <button
    onClick={() => {
      resetForm();
      setOpen(true);
    }}
    className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
  >
    Open form
  </button>
</div>
*/}
        </div>
      </div>

      <AgentsPanel />

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6">
          <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Create manual handoff</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  This will generate a Request ID token and onboard the customer into the LineScout
                  sourcing handoff system.
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            {/* Modal body (scrollable on mobile) */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Result banner */}
              {result && (
                <div
                  className={`mb-4 rounded-2xl border p-4 ${
                    result.ok
                      ? "border-emerald-900 bg-emerald-950/30"
                      : "border-red-900 bg-red-950/30"
                  }`}
                >
                  {result.ok ? (
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Created successfully</p>
                      <p className="mt-1 text-sm text-neutral-200">
                        Request ID (Token):{" "}
                        <span className="break-all font-mono font-semibold text-emerald-300">
                          {result.token}
                        </span>
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-neutral-400 sm:grid-cols-2">
                        <p>Handoff ID: {result.handoffId}</p>
                        <p>Status: {result.status}</p>
                        <p>Type: {result.handoff_type}</p>
                        <p>Email: {result.customer_email}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Failed</p>
                      <p className="mt-1 text-sm text-neutral-300">{result.error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Form */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Customer
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Customer email</label>
                  <input
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. john@example.com"
                    inputMode="email"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    Customer phone (optional)
                  </label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    WhatsApp number (optional)
                  </label>
                  <input
                    value={whatsApp}
                    onChange={(e) => setWhatsApp(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 2348012345678"
                    inputMode="tel"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-300">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 min-h-[90px] w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="Short context: what they’re sourcing, what they paid for, any key details."
                  />
                </div>

                <div className="sm:col-span-2">
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Handoff
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Initial status</label>
                  <input
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="pending"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Default is pending. You can change it if you need.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Currency</label>
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="NGN"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Total due (optional)</label>
                  <input
                    value={totalDue}
                    onChange={(e) => setTotalDue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                    placeholder="e.g. 1500000"
                    inputMode="decimal"
                  />
                </div>

                <div className="hidden sm:block" />

                {/* Initial Payment Section */}
                <div className="sm:col-span-2 mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">Initial payment (optional)</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        If you want to record a bank transfer payment immediately, enable this.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-neutral-200">
                      <input
                        type="checkbox"
                        checked={recordInitialPayment}
                        onChange={(e) => setRecordInitialPayment(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Record payment
                    </label>
                  </div>

                  {recordInitialPayment && (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-neutral-300">Amount</label>
                        <input
                          value={initialAmount}
                          onChange={(e) => setInitialAmount(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                          placeholder="e.g. 500000"
                          inputMode="decimal"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-neutral-300">Purpose</label>
                        <select
                          value={initialPurpose}
                          onChange={(e) => setInitialPurpose(e.target.value as any)}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                        >
                          <option value="downpayment">downpayment</option>
                          <option value="full_payment">full_payment</option>
                          <option value="shipping_payment">shipping_payment</option>
                          <option value="additional_payment">additional_payment</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-neutral-300">
                          Payment note (optional)
                        </label>
                        <input
                          value={initialNote}
                          onChange={(e) => setInitialNote(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                          placeholder="e.g. Bank transfer ref: ABC123"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex flex-col gap-2 border-t border-neutral-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
                disabled={submitting}
              >
                Reset
              </button>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  onClick={submitManualHandoff}
                  className="inline-flex items-center justify-center rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-60"
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? "Creating..." : "Create handoff"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}