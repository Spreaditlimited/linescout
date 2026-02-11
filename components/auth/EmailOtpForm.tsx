"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type Step = "email" | "otp";

function isValidEmail(value: string) {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function EmailOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const canSubmitEmail = isValidEmail(email) && status !== "loading";

  async function routeAfterProfile() {
    const nextParam = String(searchParams.get("next") || "").trim();
    let safeNext =
      nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
    if (safeNext === "/white-label" || safeNext.startsWith("/white-label?")) {
      safeNext = "/white-label/ideas";
    }
    if (safeNext) {
      router.replace(safeNext);
      return;
    }

    const aiRoutes = ["machine_sourcing", "white_label", "simple_sourcing"];
    let aiStarted = false;
    try {
      const results = await Promise.all(
        aiRoutes.map(async (routeType) => {
          const res = await authFetch(`/api/mobile/conversations/list?route_type=${routeType}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !Array.isArray(json?.items)) return false;
          return json.items.some((c: any) => {
            const mode = String(c?.chat_mode || "");
            if (mode !== "ai_only" && mode !== "limited_human") return false;
            const lastText = String(c?.last_message_text || "").trim();
            const lastAt = String(c?.last_message_at || "").trim();
            return Boolean(lastText || lastAt);
          });
        })
      );
      aiStarted = results.some(Boolean);
    } catch {
      aiStarted = false;
    }

    if (aiStarted) {
      router.replace("/machine");
      return;
    }

    let hasActiveProject = false;
    try {
      const res = await authFetch("/api/mobile/projects");
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.projects)) {
        hasActiveProject = json.projects.some((p: any) => String(p?.conversation_status) === "active");
      }
    } catch {
      hasActiveProject = false;
    }

    router.replace(hasActiveProject ? "/projects/active" : "/white-label/ideas");
  }

  useEffect(() => {
    let active = true;
    async function check() {
      const res = await authFetch("/api/auth/me");
      if (res.ok && active) {
        const profileRes = await authFetch("/api/mobile/profile");
        const profileJson = await profileRes.json().catch(() => ({}));
        const first = String(profileJson?.first_name || "").trim();
        const last = String(profileJson?.last_name || "").trim();

        if (!first || !last) {
          router.replace("/onboarding/name");
          return;
        }

        await routeAfterProfile();
      }
    }
    check();
    return () => {
      active = false;
    };
  }, [router]);

  async function requestOtp() {
    setStatus("loading");
    setMessage(null);

    if (!isValidEmail(email)) {
      setStatus("error");
      setMessage("Enter a valid email address.");
      return false;
    }

    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "We could not send the code. Try again.");
      return false;
    }

    setStatus("success");
    setStep("otp");
    return true;
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    await requestOtp();
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, otp }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "Invalid code. Please try again.");
      return;
    }

    await authFetch("/api/auth/me");

    const profileRes = await authFetch("/api/mobile/profile");
    const profileJson = await profileRes.json().catch(() => ({}));
    const first = String(profileJson?.first_name || "").trim();
    const last = String(profileJson?.last_name || "").trim();

    if (!first || !last) {
      router.replace("/onboarding/name");
      return;
    }

    await routeAfterProfile();
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/80 p-8 shadow-2xl shadow-[rgba(45,52,97,0.25)] backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
          LineScout
        </p>
        <h1 className="text-3xl font-semibold text-neutral-900">Welcome to LineScout</h1>
        <p className="text-sm text-neutral-600">
          {step === "email"
            ? "Use your email to continue. We'll send a one-time code."
            : "Enter the 6-digit code we emailed to you."}
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={step === "email" ? handleRequestOtp : handleVerifyOtp}>
        {step === "email" ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Verification code</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm tracking-[0.4em] text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
            />
          </div>
        )}

        {message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-xs ${
              status === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-[rgba(45,52,97,0.2)] bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]"
            }`}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={step === "email" ? !canSubmitEmail : status === "loading"}
        >
          {status === "loading"
            ? "Working..."
            : step === "email"
            ? "Send code"
            : "Verify and continue"}
        </button>
      </form>

      {step === "otp" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
          <button
            type="button"
            className="text-[var(--agent-blue)] hover:text-[var(--agent-blue)]"
            onClick={() => {
              setStep("email");
              setOtp("");
              setStatus("idle");
            }}
          >
            Change email
          </button>
          <button
            type="button"
            className="text-[var(--agent-blue)] hover:text-[var(--agent-blue)]"
            onClick={async () => {
              setStatus("idle");
              setMessage(null);
              await requestOtp();
            }}
          >
            Resend code
          </button>
        </div>
      ) : null}
    </div>
  );
}
