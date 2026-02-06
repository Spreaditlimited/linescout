"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AgentAppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nextParam = useMemo(() => {
    const safe = pathname || "/agent-app/inbox";
    return encodeURIComponent(safe);
  }, [pathname]);

  useEffect(() => {
    let live = true;

    async function boot() {
      try {
        const res = await fetch("/api/internal/auth/me", { cache: "no-store", credentials: "include" });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) {
          router.replace(`/agent-app/sign-in?next=${nextParam}`);
          return;
        }

        const role = String(data?.user?.role || "").toLowerCase();
        const otpMode = String(data?.user?.otp_mode || "phone").toLowerCase();
        const otpVerified = data?.user?.otp_verified ?? data?.user?.phone_verified;
        const userId = Number(data?.user?.id || 0);
        const email = String(data?.user?.email || "");

        if (role === "admin") {
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
