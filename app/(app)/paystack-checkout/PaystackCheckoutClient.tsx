"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label" | "simple_sourcing";

type InitResp = {
  ok: boolean;
  authorization_url?: string;
  reference?: string;
  error?: string;
};

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label" || v === "simple_sourcing";
}

export default function PaystackCheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const purpose = useMemo(() => String(searchParams.get("purpose") || "sourcing"), [searchParams]);
  const routeType = useMemo<RouteType>(() => {
    const rt = String(searchParams.get("route_type") || "machine_sourcing").trim();
    return isValidRouteType(rt) ? (rt as RouteType) : "machine_sourcing";
  }, [searchParams]);
  const sourceConversationId = useMemo(() => {
    const raw = String(searchParams.get("source_conversation_id") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const reorderOfConversationId = useMemo(() => {
    const raw = String(searchParams.get("reorder_of_conversation_id") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const reorderUserNote = useMemo(
    () => String(searchParams.get("reorder_user_note") || "").trim(),
    [searchParams]
  );
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

  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      setError(null);

      const callbackUrl = `${window.location.origin}/paystack/verify?purpose=${encodeURIComponent(
        purpose
      )}&route_type=${encodeURIComponent(routeType)}`;

      const res = await authFetch("/api/payments/paystack/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          route_type: routeType,
          source_conversation_id: sourceConversationId,
          reorder_of_conversation_id: reorderOfConversationId,
          reorder_user_note: reorderUserNote,
          simple_product_name: simpleProductName || null,
          simple_quantity: simpleQuantity || null,
          simple_destination: simpleDestination || null,
          simple_notes: simpleNotes || null,
          product_id: productId || null,
          product_name: productName || null,
          product_category: productCategory || null,
          product_landed_ngn_per_unit: productLandedPerUnit || null,
          callback_url: callbackUrl,
        }),
      });

      const json: InitResp = await res.json().catch(() => ({
        ok: false,
        error: "Bad response",
      }));

      if (!res.ok || !json?.ok || !json.authorization_url || !json.reference) {
        if (active) setError(json?.error || "Could not start payment. Please try again.");
        setLoading(false);
        return;
      }

      if (!active) return;
      setAuthUrl(json.authorization_url);
      setReference(json.reference);
      setLoading(false);
    }
    init();
    return () => {
      active = false;
    };
  }, [
    purpose,
    routeType,
    sourceConversationId,
    reorderOfConversationId,
    reorderUserNote,
    simpleProductName,
    simpleQuantity,
    simpleDestination,
    simpleNotes,
    productId,
    productName,
    productCategory,
    productLandedPerUnit,
  ]);

  return (
    <div className="flex min-h-[70vh] items-center px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <p className="mx-auto text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
            Secure checkout
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Complete your payment</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We’ll open Paystack to complete your payment. Once it’s done, we’ll verify and create your
            project automatically.
          </p>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              Preparing secure checkout…
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="mt-6 space-y-3 text-left">
              <button
                type="button"
                onClick={() => {
                  if (authUrl) window.location.href = authUrl;
                }}
                className="btn btn-primary w-full"
              >
                Continue to Paystack
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
