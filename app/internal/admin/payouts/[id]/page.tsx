// app/internal/admin/payouts/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PayoutStatus = "pending" | "approved" | "rejected" | "paid" | "failed";

type PayoutItem = {
  id: number;
  internal_user_id: number;
  amount_kobo: number;
  currency: string;
  status: PayoutStatus;

  requested_note: string | null;
  admin_note: string | null;

  requested_at: string | null;
  approved_at: string | null;
  paid_at: string | null;

  paystack_transfer_code: string | null;
  paystack_reference: string | null;

  username: string;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  china_phone: string | null;
  china_city: string | null;
  nationality: string | null;

  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  bank_verified_at: string | null;
  bank_status: string | null;
};

type ListResp =
  | { ok: true; status: string; items: PayoutItem[]; next_cursor: number | null }
  | { ok: false; error: string };

function fmt(d?: string | null) {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
}

function money(amountKobo: number, currency: string) {
  const amt = Number(amountKobo || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amt);
  } catch {
    return `${currency || "NGN"} ${amt.toFixed(2)}`;
  }
}

function statusPill(status: string) {
  const s = String(status || "").toLowerCase();
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize";

  if (s === "pending") return `${base} border-amber-700/60 bg-amber-500/10 text-amber-200`;
  if (s === "approved") return `${base} border-sky-700/60 bg-sky-500/10 text-sky-200`;
  if (s === "paid") return `${base} border-emerald-700/60 bg-emerald-500/10 text-emerald-200`;
  if (s === "rejected") return `${base} border-red-700/60 bg-red-500/10 text-red-200`;
  if (s === "failed") return `${base} border-violet-700/60 bg-violet-500/10 text-violet-200`;

  return `${base} border-neutral-700 bg-neutral-900/60 text-neutral-200`;
}

function subtlePill(label: string) {
  return "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900/50 px-2 py-0.5 text-[11px] font-semibold text-neutral-200";
}

function warnBox(text: string) {
  return (
    <div className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-3">
      <div className="text-xs font-semibold text-amber-200">Attention</div>
      <div className="mt-1 text-sm text-amber-200/90">{text}</div>
    </div>
  );
}


export default function AdminPayoutDetailPage() {
  const params = useParams<{ id: string }>();
  const payoutId = Number(params?.id || 0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [item, setItem] = useState<PayoutItem | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // reject flow
  const [rejectReason, setRejectReason] = useState("");

  // confirm modal (lightweight inline)
  const [confirm, setConfirm] = useState<null | { mode: "approve" | "reject" | "pay"; title: string; desc: string }>(
    null
  );

  const bankVerified = useMemo(() => {
    if (!item) return false;
    const byDate = !!item.bank_verified_at;
    const byStatus = String(item.bank_status || "").toLowerCase() === "verified";
    return byDate || byStatus;
  }, [item]);

  const canApprove = useMemo(() => {
    if (!item) return false;
    return item.status === "pending" && bankVerified && item.amount_kobo > 0;
  }, [item, bankVerified]);

  const canReject = useMemo(() => {
    if (!item) return false;
    return item.status === "pending";
  }, [item]);

  const canPay = useMemo(() => {
    if (!item) return false;
    return item.status === "approved" && bankVerified && item.amount_kobo > 0;
  }, [item, bankVerified]);

  async function load() {
    if (!payoutId) return;

    setLoading(true);
    setErr(null);
    setBanner(null);

    try {
  const res = await fetch(
    `/api/internal/admin/payout-requests/${payoutId}`,
    { cache: "no-store" }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to load payout request");
  }

  setItem(data.item);
} catch (e: any) {
  setItem(null);
  setErr(e?.message || "Failed to load payout request");
} finally {
  setLoading(false);
}
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutId]);

  async function doApprove() {
    if (!item) return;
    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/internal/admin/payout-requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: item.id, action: "approve" }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = String(data?.error || "Failed to approve payout request");
        throw new Error(msg);
      }

      setBanner({ type: "ok", msg: "Approved. You can now pay this request." });
      await load();
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to approve payout request" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function doReject() {
    if (!item) return;
    const reason = String(rejectReason || "").trim();
    if (!reason) {
      setBanner({ type: "err", msg: "Rejection requires a reason." });
      return;
    }

    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/internal/admin/payout-requests/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: item.id, admin_note: reason }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = String(data?.error || "Failed to reject payout request");
        throw new Error(msg);
      }

      setBanner({ type: "ok", msg: "Rejected." });
      await load();
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to reject payout request" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function doPay() {
    if (!item) return;

    setBusy(true);
    setBanner(null);

    try {
      const res = await fetch("/api/internal/admin/payout-requests/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_request_id: item.id }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = String(data?.error || "Failed to pay payout request");
        throw new Error(msg);
      }

      setBanner({ type: "ok", msg: "Payment initiated and recorded as paid." });
      await load();
    } catch (e: any) {
      setBanner({ type: "err", msg: e?.message || "Failed to pay payout request" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const card = "rounded-2xl border border-neutral-800 bg-neutral-950 p-4";
  const btn =
    "inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary =
    "inline-flex items-center justify-center rounded-xl border border-white bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const btnDanger =
    "inline-flex items-center justify-center rounded-xl border border-red-700/60 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className={card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">
              <Link href="/internal/admin/payouts" className="hover:text-neutral-300">
                Admin Payouts
              </Link>{" "}
              <span className="text-neutral-700">/</span>{" "}
              <span className="text-neutral-300">Request #{payoutId || "N/A"}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-neutral-100">Payout Request #{payoutId}</div>
              {item?.status ? <span className={statusPill(item.status)}>{item.status}</span> : null}
              {item?.currency ? <span className={subtlePill(item.currency)}>{item.currency}</span> : null}
            </div>

            <div className="mt-1 text-sm text-neutral-400">
              {item?.username ? (
                <>
                  Requested by <span className="text-neutral-200">@{item.username}</span>
                </>
              ) : (
                "Loading requester..."
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={btn} onClick={load} disabled={loading || busy}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {banner ? (
          <div
            className={`mt-4 rounded-2xl border px-3 py-2 text-sm ${
              banner.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {banner.msg}
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/30 p-4">
            <p className="text-sm text-red-200">{err}</p>
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-neutral-400">Loading payout request...</p> : null}

      {item ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Summary */}
          <div className={`lg:col-span-2 ${card}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                  Summary
                </div>

                <div className="mt-2 text-3xl font-semibold text-neutral-100">
                  {money(item.amount_kobo, item.currency)}
                </div>

                <div className="mt-2 text-sm text-neutral-400">
                  Requested: <span className="text-neutral-200">{fmt(item.requested_at)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-500">Agent</div>
                <div className="mt-1 text-sm font-semibold text-neutral-100">
                  {(item.first_name || "").trim() || (item.last_name || "").trim()
                    ? `${item.first_name || ""} ${item.last_name || ""}`.trim()
                    : "N/A"}
                </div>
                <div className="mt-1 text-xs text-neutral-400 break-all">{item.email || "No email"}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  @{item.username} <span className="text-neutral-600">•</span> {item.china_city || "No city"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-500">China phone</div>
                <div className="mt-1 text-sm text-neutral-200">{item.china_phone || "N/A"}</div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-500">Nationality</div>
                <div className="mt-1 text-sm text-neutral-200">{item.nationality || "N/A"}</div>
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-500">Agent note</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">
                  {item.requested_note || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Bank + Audit */}
          <div className="space-y-5">
            <div className={card}>
              <div className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                Bank account
              </div>

              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="text-xs text-neutral-500">Account name</div>
                  <div className="text-neutral-200">{item.account_name || "N/A"}</div>
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Account number</div>
                  {/* per your instruction: do not mask */}
                  <div className="text-neutral-200">{item.account_number || "N/A"}</div>
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Bank code</div>
                  <div className="text-neutral-200">{item.bank_code || "N/A"}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={statusPill(bankVerified ? "verified" : "unverified")}>
                    {bankVerified ? "verified" : "unverified"}
                  </span>
                  <span className="text-xs text-neutral-500">{fmt(item.bank_verified_at)}</span>
                </div>

                {!bankVerified ? (
                  warnBox("Bank account is not verified. You cannot approve or pay this request.")
                ) : null}
              </div>
            </div>

            <div className={card}>
              <div className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                Audit timeline
              </div>

              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-neutral-500">Requested</div>
                    <div className="text-neutral-200">{fmt(item.requested_at)}</div>
                  </div>
                  <span className={subtlePill("step 1")}>1</span>
                </div>

                <div className="h-px bg-neutral-800" />

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-neutral-500">Approved</div>
                    <div className="text-neutral-200">{fmt(item.approved_at)}</div>
                  </div>
                  <span className={subtlePill("step 2")}>2</span>
                </div>

                <div className="h-px bg-neutral-800" />

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-neutral-500">Paid</div>
                    <div className="text-neutral-200">{fmt(item.paid_at)}</div>
                  </div>
                  <span className={subtlePill("step 3")}>3</span>
                </div>

                {item.status === "paid" ? (
                  <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
                    <div className="text-xs text-neutral-500">Paystack transfer code</div>
                    <div className="mt-1 text-sm text-neutral-200 break-all">
                      {item.paystack_transfer_code || "N/A"}
                    </div>

                    <div className="mt-3 text-xs text-neutral-500">Paystack reference</div>
                    <div className="mt-1 text-sm text-neutral-200 break-all">
                      {item.paystack_reference || "N/A"}
                    </div>
                  </div>
                ) : null}

                {item.status === "rejected" && item.admin_note ? (
                  <div className="mt-3 rounded-2xl border border-red-900/50 bg-red-950/30 p-3">
                    <div className="text-xs font-semibold text-red-200">Rejection reason</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">{item.admin_note}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={`lg:col-span-3 ${card}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                  Actions
                </div>
                <div className="mt-1 text-sm text-neutral-400">
                  This screen is intentionally strict. You can’t approve or pay if core requirements fail.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Pending */}
                {item.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy || !canApprove}
                      onClick={() =>
                        setConfirm({
                          mode: "approve",
                          title: "Approve payout request?",
                          desc: "Approving means it is valid and can now be paid. This does not send money yet.",
                        })
                      }
                      title={!bankVerified ? "Bank not verified." : !canApprove ? "Not eligible to approve." : ""}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      className={btnDanger}
                      disabled={busy || !canReject}
                      onClick={() =>
                        setConfirm({
                          mode: "reject",
                          title: "Reject payout request?",
                          desc: "Rejection requires a clear reason. The agent will see it.",
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                ) : null}

                {/* Approved */}
                {item.status === "approved" ? (
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy || !canPay}
                    onClick={() =>
                      setConfirm({
                        mode: "pay",
                        title: "Pay this request now?",
                        desc: "This triggers a real transfer via Paystack and marks the request as paid on success.",
                      })
                    }
                    title={!bankVerified ? "Bank not verified." : !canPay ? "Not eligible to pay." : ""}
                  >
                    Pay now
                  </button>
                ) : null}

                {/* Paid / Rejected / Failed */}
                {item.status === "paid" ? (
                  <span className="text-sm text-neutral-400">No actions. This request is already paid.</span>
                ) : null}

                {item.status === "rejected" ? (
                  <span className="text-sm text-neutral-400">No actions. This request has been rejected.</span>
                ) : null}

                {item.status === "failed" ? (
                  <span className="text-sm text-neutral-400">
                    This request is marked as failed. If your policy is to retry, pay from the Approved tab after re-approval.
                  </span>
                ) : null}
              </div>
            </div>

            {/* Reject reason input (only for pending, always visible so admin doesn’t get trapped in a modal) */}
            {item.status === "pending" ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-xs text-neutral-500">Rejection reason (required to reject)</div>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Write a clear reason. Example: Bank account not verified yet. Please complete verification."
                    className="mt-2 w-full min-h-[90px] resize-none rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-700"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Keep it factual. This message affects trust.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Lightweight confirm overlay */}
      {confirm ? (
        <div className="fixed inset-0 z-[9999]">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close"
            onClick={() => setConfirm(null)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div className="border-b border-neutral-800 px-4 py-3">
              <div className="text-sm font-semibold text-neutral-100">{confirm.title}</div>
              <div className="mt-1 text-sm text-neutral-400">{confirm.desc}</div>
            </div>

            <div className="p-4">
              {confirm.mode === "approve" && !canApprove ? (
                warnBox("Cannot approve. Bank must be verified and amount must be valid.")
              ) : null}

              {confirm.mode === "pay" && !canPay ? (
                warnBox("Cannot pay. Request must be approved and bank must be verified.")
              ) : null}

              {confirm.mode === "reject" && !String(rejectReason || "").trim() ? (
                warnBox("Rejection requires a reason. Type it in the rejection box first.")
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" className={btn} onClick={() => setConfirm(null)} disabled={busy}>
                  Cancel
                </button>

                {confirm.mode === "approve" ? (
                  <button type="button" className={btnPrimary} onClick={doApprove} disabled={busy || !canApprove}>
                    {busy ? "Working..." : "Yes, approve"}
                  </button>
                ) : null}

                {confirm.mode === "reject" ? (
                  <button
                    type="button"
                    className={btnDanger}
                    onClick={doReject}
                    disabled={busy || !canReject || !String(rejectReason || "").trim()}
                  >
                    {busy ? "Working..." : "Yes, reject"}
                  </button>
                ) : null}

                {confirm.mode === "pay" ? (
                  <button type="button" className={btnPrimary} onClick={doPay} disabled={busy || !canPay}>
                    {busy ? "Working..." : "Yes, pay"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}