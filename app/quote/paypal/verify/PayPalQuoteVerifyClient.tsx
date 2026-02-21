"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type VerifyResp = {
  ok: boolean;
  token?: string;
  error?: string;
};

export default function PayPalQuoteVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = useMemo(() => {
    return String(
      searchParams.get("token") ||
        searchParams.get("order_id") ||
        searchParams.get("paymentId") ||
        ""
    ).trim();
  }, [searchParams]);
  const quoteToken = useMemo(() => String(searchParams.get("quote") || "").trim(), [searchParams]);

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!orderId) {
        setStatus("error");
        setMessage("Missing PayPal order.");
        return;
      }

      setStatus("loading");
      setMessage(null);

      const res = await fetch("/api/quote/paypal/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });

      const json: VerifyResp = await res.json().catch(() => ({
        ok: false,
        error: "Bad response",
      }));

      if (!active) return;

      if (!res.ok || !json?.ok) {
        setStatus("error");
        setMessage(json?.error || "Payment not confirmed yet. Please retry.");
        return;
      }

      setStatus("success");
      setMessage("Payment verified. Redirecting to your quote…");

      const token = json?.token || quoteToken;
      if (token) {
        router.replace(`/quote/${token}`);
        return;
      }

      router.replace("/quote");
    }

    verify();
    return () => {
      active = false;
    };
  }, [orderId, quoteToken, router, retryNonce]);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payment verification</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Verifying payment</h1>
          <p className="mt-2 text-sm text-neutral-600">We’re confirming your payment with PayPal.</p>

          {status === "loading" ? (
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              Verifying…
            </div>
          ) : null}

          {status === "error" ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setRetryNonce((v) => v + 1)}
                  className="btn btn-outline"
                >
                  Retry verification
                </button>
                <button type="button" onClick={() => router.replace("/quote")} className="btn btn-ghost">
                  Back to quotes
                </button>
              </div>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="mt-6 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] p-4 text-sm text-[var(--agent-blue)]">
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
