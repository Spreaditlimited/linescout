"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/metaPixel";

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

export default function TokenPanel({ prefillContext = "" }: { prefillContext?: string }) {
  // Token (persisted)
  const [sourcingToken, setSourcingToken] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Handoff modal
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);

  const [handoffName, setHandoffName] = useState("");
  const [handoffEmail, setHandoffEmail] = useState("");
  const [handoffWhatsapp, setHandoffWhatsapp] = useState("");
  const [handoffContext, setHandoffContext] = useState("");

  // UI alert modal
  const [uiAlertOpen, setUiAlertOpen] = useState(false);
  const [uiAlertTitle, setUiAlertTitle] = useState("Notice");
  const [uiAlertMessage, setUiAlertMessage] = useState("");

  function showUiAlert(title: string, message: string) {
    setUiAlertTitle(title);
    setUiAlertMessage(message);
    setUiAlertOpen(true);
  }

  function normalizeWhatsAppUI(raw: string) {
    const digits = raw.replace(/\D/g, "");

    if (digits.startsWith("234")) {
      if (digits.length !== 13) throw new Error("Invalid Nigerian WhatsApp number.");
      return digits;
    }

    if (digits.startsWith("0")) {
      const trimmed = digits.slice(1);
      if (trimmed.length !== 10) throw new Error("Invalid Nigerian WhatsApp number.");
      return "234" + trimmed;
    }

    if (digits.length === 10) return "234" + digits;

    throw new Error("Please enter a valid Nigerian WhatsApp number.");
  }

  // Load token once
  useEffect(() => {
    const key = "linescout_sourcing_token";
    const existing = localStorage.getItem(key);
    if (existing) setSourcingToken(existing);
  }, []);

  // Save token whenever it changes
  useEffect(() => {
    const key = "linescout_sourcing_token";
    const v = sourcingToken.trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);

    // if token changes, it is no longer verified
    setIsVerified(false);
  }, [sourcingToken]);

  // Prefill handoff fields from stored lead (if present)
  useEffect(() => {
    const n = localStorage.getItem("linescout_lead_name") || "";
    const w = localStorage.getItem("linescout_lead_whatsapp") || "";
    const e = localStorage.getItem("linescout_lead_email") || "";

    if (n) setHandoffName(n);
    if (w) setHandoffWhatsapp(w);
    if (e) setHandoffEmail(e);
  }, []);

  useEffect(() => {
  if (!prefillContext) return;
  // Only prefill if user hasn’t typed anything yet
  setHandoffContext((prev) => (prev.trim() ? prev : prefillContext));
}, [prefillContext]);

  async function handleVerifyOrGetToken() {
    const t = sourcingToken.trim();

    // No token typed, treat as "Get your token"
    if (!t) {
      window.open("https://paystack.shop/pay/sourcing", "_blank", "noopener,noreferrer");
      return;
    }

    if (verifying) return;

    setVerifying(true);
    try {
      const res = await fetch("/api/verify-sourcing-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, type: "sourcing" }),
      });

      const data = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || !data.ok) {
        showUiAlert("Token not valid", String(data?.message || data?.error || "Token is invalid or expired."));
        setIsVerified(false);
        return;
      }

      setIsVerified(true);
      track("CompleteRegistration", { content_name: "Sourcing Token Verified" });

      if (data.email) setHandoffEmail(String(data.email));
      if (data.customer_name) setHandoffName(String(data.customer_name));

      if (data.customer_phone) {
        if (!handoffWhatsapp) setHandoffWhatsapp(String(data.customer_phone));
        localStorage.setItem("linescout_lead_whatsapp", String(data.customer_phone));
      }

      // Prefill whatsapp from lead if available
      const storedWhatsapp = localStorage.getItem("linescout_lead_whatsapp") || "";
      if (storedWhatsapp && !handoffWhatsapp) setHandoffWhatsapp(storedWhatsapp);

      setShowHandoffModal(true);
    } catch {
      alert("Could not verify token. Please try again.");
      setIsVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  async function submitHandoff() {
    const t = sourcingToken.trim();
    const email = handoffEmail.trim();
    const context = handoffContext.trim();
    const name = handoffName.trim();

    let whatsapp: string;
    try {
      whatsapp = normalizeWhatsAppUI(handoffWhatsapp.trim());
    } catch (err: any) {
      alert(err.message);
      return;
    }

    if (!t) {
      alert("Please paste your token first.");
      return;
    }

    if (!name || !email || !whatsapp || !context) {
      alert("Please fill all fields.");
      return;
    }

    if (handoffSubmitting) return;

    setHandoffSubmitting(true);
    try {
      const res = await fetch("/api/linescout-handoffs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: t,
          customer_name: name,
          email,
          whatsapp_number: whatsapp,
          context,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || data?.message || "Could not submit handoff");

      setShowHandoffModal(false);
      setHandoffContext("");

      showUiAlert("We have received your details.", "You will receive a WhatsApp message shortly.");
      track("Contact", { content_name: "Human Agent Handoff" });
    } catch (e: any) {
      alert(e?.message || "Could not submit handoff. Please try again.");
    } finally {
      setHandoffSubmitting(false);
    }
  }

  const verifyLabel = sourcingToken.trim() ? (verifying ? "Verifying…" : "Verify token") : "Get your token";

  return (
    <div className="space-y-4">
      {/* Token card */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">Sourcing token</span>

              {isVerified ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 text-xs text-neutral-200">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  Verified
                </span>
              ) : sourcingToken.trim() ? (
                <span className="text-xs text-neutral-400">Token pasted</span>
              ) : (
                <span className="text-xs text-neutral-400"></span>
              )}
            </div>

            <p className="mt-2 text-sm text-neutral-400">
              Paste your token to move to our human agents for exact quotation, landing cost computation, and procurement. You can also buy a token
              here.
            </p>
          </div>
        </div>

        <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={sourcingToken}
            onChange={(e) => setSourcingToken(e.target.value)}
            placeholder="Paste sourcing token"
            className="w-full sm:flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-700 outline-none"
          />

          <button
            type="button"
            onClick={handleVerifyOrGetToken}
            disabled={verifying}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifyLabel}
          </button>
        </div>

        <div className="mt-2 text-xs text-neutral-500">
          Tip: If you already paid, paste the token and click verify.
        </div>
      </div>

      {/* Handoff Modal */}
      {showHandoffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl shadow-black/50">
            <h2 className="text-lg font-semibold text-white mb-1">Ready for human agents</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Confirm your details and tell us briefly what you want to source.
            </p>

            <div className="space-y-3">
              <input
                value={handoffName}
                onChange={(e) => setHandoffName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              />

              <input
                value={handoffEmail}
                onChange={(e) => setHandoffEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              />

              <input
                value={handoffWhatsapp}
                onChange={(e) => setHandoffWhatsapp(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={13}
                placeholder="WhatsApp number (e.g. 8037649956)"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              />

              <textarea
                value={handoffContext}
                onChange={(e) => setHandoffContext(e.target.value)}
                placeholder="What are you in the market for? Mention product, capacity, location, budget if you have one."
                className="w-full min-h-[110px] resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              />
            </div>

            <button
              onClick={submitHandoff}
              disabled={handoffSubmitting}
              className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {handoffSubmitting ? "Submitting…" : "Let’s get started"}
            </button>

            <button
              type="button"
              onClick={() => setShowHandoffModal(false)}
              className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* UI alert modal */}
      {uiAlertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl shadow-black/50">
            <h2 className="text-lg font-semibold text-white mb-1">{uiAlertTitle}</h2>
            <p className="text-sm text-neutral-300 whitespace-pre-line">{uiAlertMessage}</p>

            <button
              type="button"
              onClick={() => setUiAlertOpen(false)}
              className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}