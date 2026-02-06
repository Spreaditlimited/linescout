"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type RouteType = "machine_sourcing" | "white_label";

type VerifyResp = {
  ok: boolean;
  conversation_id?: number;
  handoff_id?: number;
  route_type?: RouteType;
  error?: string;
};

function isValidRouteType(v: any): v is RouteType {
  return v === "machine_sourcing" || v === "white_label";
}

export default function PaystackVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reference = useMemo(() => String(searchParams.get("reference") || "").trim(), [searchParams]);
  const purpose = useMemo(() => String(searchParams.get("purpose") || "sourcing").trim(), [searchParams]);
  const routeType = useMemo<RouteType>(() => {
    const rt = String(searchParams.get("route_type") || "machine_sourcing").trim();
    return isValidRouteType(rt) ? (rt as RouteType) : "machine_sourcing";
  }, [searchParams]);

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!reference) {
        setStatus("error");
        setMessage("Missing payment reference.");
        return;
      }

      const res = await authFetch("/api/payments/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, purpose }),
      });

      const json: VerifyResp = await res.json().catch(() => ({
        ok: false,
        error: "Bad response",
      }));

      if (!active) return;

      if (!res.ok || !json?.ok) {
        setStatus("error");
        setMessage(
          json?.error ||
            "Payment not confirmed yet. If you were charged, wait 30 seconds and retry."
        );
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
  }, [reference, purpose, routeType, router]);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Payment verification</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Verifying payment</h1>
          <p className="mt-2 text-sm text-neutral-600">
            We’re confirming your payment with Paystack and setting up your project.
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
                  onClick={() => router.replace(`/paystack-checkout?purpose=${encodeURIComponent(purpose)}&route_type=${encodeURIComponent(routeType)}`)}
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
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
