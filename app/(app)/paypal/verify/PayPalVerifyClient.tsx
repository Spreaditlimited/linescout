"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

type VerifyResp = {
  ok: boolean;
  conversation_id?: number;
  handoff_id?: number;
  route_type?: RouteType;
  error?: string;
};

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

export default function PayPalVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);
  const purpose = useMemo(() => String(searchParams.get("purpose") || "sourcing").trim(), [searchParams]);
  const routeType = useMemo<RouteType>(() => {
    const rt = String(searchParams.get("route_type") || "machine_sourcing").trim();
    return isValidRouteType(rt) ? (rt as RouteType) : "machine_sourcing";
  }, [searchParams]);
  const sourceConversationId = useMemo(() => {
    const raw = String(searchParams.get("source_conversation_id") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const simpleProductName = useMemo(
    () => String(searchParams.get("simple_product_name") || "").trim(),
    [searchParams]
  );
  const simpleQuantity = useMemo(
    () => String(searchParams.get("simple_quantity") || "").trim(),
    [searchParams]
  );
  const simpleDestination = useMemo(
    () => String(searchParams.get("simple_destination") || "").trim(),
    [searchParams]
  );
  const simpleNotes = useMemo(
    () => String(searchParams.get("simple_notes") || "").trim(),
    [searchParams]
  );
  const productId = useMemo(() => String(searchParams.get("product_id") || "").trim(), [searchParams]);
  const productName = useMemo(() => String(searchParams.get("product_name") || "").trim(), [searchParams]);
  const productCategory = useMemo(
    () => String(searchParams.get("product_category") || "").trim(),
    [searchParams]
  );
  const productLandedPerUnit = useMemo(
    () => String(searchParams.get("product_landed_ngn_per_unit") || "").trim(),
    [searchParams]
  );

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

      const res = await authFetch("/api/payments/paypal/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          purpose,
          route_type: routeType,
          source_conversation_id: sourceConversationId,
          simple_product_name: simpleProductName || null,
          simple_quantity: simpleQuantity || null,
          simple_destination: simpleDestination || null,
          simple_notes: simpleNotes || null,
          product_id: productId || null,
          product_name: productName || null,
          product_category: productCategory || null,
          product_landed_ngn_per_unit: productLandedPerUnit || null,
        }),
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
      setMessage("Payment verified. Redirecting to your project…");

      const conversationId = Number(json.conversation_id || 0);
      if (conversationId > 0) {
        router.replace(`/projects/${conversationId}`);
        return;
      }

      router.replace("/projects");
    }

    verify();
    return () => {
      active = false;
    };
  }, [
    orderId,
    purpose,
    routeType,
    sourceConversationId,
    simpleProductName,
    simpleQuantity,
    simpleDestination,
    simpleNotes,
    productId,
    productName,
    productCategory,
    productLandedPerUnit,
    router,
    retryNonce,
  ]);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payment verification</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Verifying payment</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We’re confirming your payment with PayPal and setting up your project.
          </p>

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
                <button type="button" onClick={() => router.replace("/projects")} className="btn btn-ghost">
                  Back to projects
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
