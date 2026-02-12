"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchAgentOtpMode } from "../../lib/otp";

export default function AgentAppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = "linescout_agent_gate_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const nextParam = useMemo(() => {
    const safe = pathname || "/agent-app/inbox";
    return encodeURIComponent(safe);
  }, [pathname]);

  useEffect(() => {
    let live = true;
    let restoreFetch: (() => void) | null = null;

    async function boot() {
      if (typeof window !== "undefined") {
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.startsWith("/api/internal")) {
            const headers = new Headers(init?.headers || {});
            headers.set("x-linescout-app", "agent");
            return originalFetch(input, { ...init, headers });
          }
          return originalFetch(input, init);
        };
        restoreFetch = () => {
          window.fetch = originalFetch;
        };
      }

      try {
        if (typeof window !== "undefined") {
          const raw = window.sessionStorage.getItem(CACHE_KEY);
          if (raw) {
            try {
              const cached = JSON.parse(raw);
              const fresh = Date.now() - Number(cached?.ts || 0) < CACHE_TTL_MS;
              if (fresh && cached?.ok && cached?.allow === true) {
                setLoading(false);
              }
            } catch {
              // ignore cache parse errors
            }
          }
        }

        const res = await fetch("/api/internal/auth/me", { cache: "no-store", credentials: "include" });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) {
          router.replace(`/agent-app/sign-in?next=${nextParam}`);
          return;
        }

        const role = String(data?.user?.role || "").toLowerCase();
        const otpMode = await fetchAgentOtpMode();
        const emailVerified = !!data?.user?.email_verified;
        const phoneVerified = !!(data?.user?.phone_verified ?? data?.user?.otp_verified);
        const otpVerified = otpMode === "email" ? emailVerified : phoneVerified;
        const userId = Number(data?.user?.id || 0);
        const email = String(data?.user?.email || "");

        if (role === "admin") {
          router.replace(`/agent-app/sign-in?next=${nextParam}`);
          return;
        }

        if (role === "agent" && !otpVerified && userId > 0) {
          const target = otpMode === "email" ? "email-verify" : "phone-verify";
          const emailParam = email ? `&email=${encodeURIComponent(email)}` : "";
          router.replace(`/agent-app/${target}?user_id=${userId}&post=app${emailParam}`);
          return;
        }

        if (role !== "agent") {
          router.replace(`/agent-app/sign-in?next=${nextParam}`);
          return;
        }

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                ts: Date.now(),
                ok: true,
                allow: true,
              })
            );
          } catch {
            // ignore cache write errors
          }
        }
      } catch (e: any) {
        if (!live) return;
        setError(e?.message || "Failed to load agent session.");
      } finally {
        if (live) setLoading(false);
      }
    }

    boot();
    return () => {
      live = false;
      if (restoreFetch) restoreFetch();
    };
  }, [router, nextParam]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {loading || error ? (
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 text-sm text-neutral-600 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            {loading ? "Loading agent workspace…" : error}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
