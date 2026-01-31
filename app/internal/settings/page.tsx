"use client";

import { useEffect, useMemo, useState } from "react";
import ShippingCompaniesPanel from "../_components/ShippingCompaniesPanel";

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

type BankItem = { id: number; name: string; is_active?: number };

export default function InternalSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  // Manual handoff modal
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ManualHandoffResponse | null>(null);

  // Banks (for dropdown + management)
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksErr, setBanksErr] = useState<string | null>(null);

  // Bank creation (settings)
  const [newBankName, setNewBankName] = useState("");
  const [creatingBank, setCreatingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const [bankCreateErr, setBankCreateErr] = useState<string | null>(null);

  // Selected bank for initial payment inside manual handoff modal
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [notes, setNotes] = useState("");

  // Handoff defaults
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

  async function loadBanks() {
    setBanksLoading(true);
    setBanksErr(null);
    try {
      const res = await fetch("/api/linescout-banks", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load banks");
      setBanks((data.items || []) as BankItem[]);
    } catch (e: any) {
      setBanksErr(e?.message || "Failed to load banks");
    } finally {
      setBanksLoading(false);
    }
  }

  useEffect(() => {
    // Load banks once (for modal dropdown + settings list)
    loadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // require bank selection if recording payment
      if (!selectedBankId) return false;
    }

    return true;
  }, [
    customerName,
    customerEmail,
    status,
    totalDue,
    recordInitialPayment,
    initialAmount,
    selectedBankId,
  ]);

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
    setSelectedBankId(null);
    setResult(null);
  }

  async function submitManualHandoff() {
    if (!canSubmit) return;

    setSubmitting(true);
    setResult(null);

    try {
      const payload: any = {
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
              bank_id: selectedBankId, // key addition
            }
          : null,
      };

      // Optional: also send bank_id at root (safe if backend ignores)
      if (recordInitialPayment) payload.bank_id = selectedBankId;

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

  async function createBank() {
    setBankMsg(null);
    setBankCreateErr(null);

    const name = newBankName.trim();
    if (name.length < 2) {
      setBankCreateErr("Bank name is too short.");
      return;
    }

    setCreatingBank(true);
    try {
      const res = await fetch("/api/linescout-banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to create bank");

      setNewBankName("");
      setBankMsg(`Created bank "${name}".`);
      await loadBanks();
    } catch (e: any) {
      setBankCreateErr(e?.message || "Failed to create bank");
    } finally {
      setCreatingBank(false);
    }
  }

  if (!me) return <p className="text-sm text-neutral-400">Loading...</p>;

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
        <p className="mt-1 text-sm text-neutral-400">Admins only.</p>
      </div>
    );
  }

  const activeBanks = banks.filter((b) => b.is_active !== 0);

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
        </div>
      </div>

      <ShippingCompaniesPanel />

      {/* Banks panel */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Banks</h3>
            <p className="text-xs text-neutral-400">
              Maintain the list of banks customers pay into. Used during manual onboarding and payment logging.
            </p>
          </div>

          <div className="w-full lg:max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-semibold text-neutral-100">Add bank</div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-neutral-400">Bank name</label>
                <input
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                  placeholder="e.g. Access Bank"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createBank}
                  disabled={creatingBank}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60"
                >
                  {creatingBank ? "Adding..." : "Add"}
                </button>

                <button
                  onClick={loadBanks}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            {bankMsg ? (
              <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                {bankMsg}
              </div>
            ) : null}

            {bankCreateErr ? (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {bankCreateErr}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          {banksLoading ? <p className="text-sm text-neutral-400">Loading banks...</p> : null}
          {banksErr ? <p className="text-sm text-red-300">{banksErr}</p> : null}

          {!banksLoading && !banksErr ? (
            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/70 text-neutral-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Active</th>
                  </tr>
                </thead>
                <tbody className="bg-neutral-950">
                  {banks.map((b) => (
                    <tr key={b.id} className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-neutral-100">{b.name}</td>
                      <td className="px-3 py-2 text-neutral-200">
                        {b.is_active === 0 ? "No" : "Yes"}
                      </td>
                    </tr>
                  ))}
                  {banks.length === 0 ? (
                    <tr className="border-t border-neutral-800">
                      <td className="px-3 py-3 text-neutral-400" colSpan={2}>
                        No banks yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

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

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4">
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

                {/* Initial Payment */}
                <div className="sm:col-span-2 mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-100">
                        Initial payment (optional)
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        If you want to record a bank transfer payment immediately, enable this.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-neutral-200">
                      <input
                        type="checkbox"
                        checked={recordInitialPayment}
                        onChange={(e) => {
                          setRecordInitialPayment(e.target.checked);
                          if (!e.target.checked) setSelectedBankId(null);
                        }}
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
                        <label className="text-xs font-medium text-neutral-300">Bank</label>
                        <select
                          value={selectedBankId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setSelectedBankId(v);
                          }}
                          className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
                        >
                          <option value="">Select bank</option>
                          {activeBanks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-neutral-500">
                          Required when recording a payment.
                        </p>
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