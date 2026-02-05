"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type Step = "email" | "otp";

export default function EmailOtpForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function routeAfterProfile() {
    const projectsRes = await authFetch("/api/mobile/projects");
    const projectsJson = await projectsRes.json().catch(() => ({}));
    if (!projectsRes.ok) {
      router.replace("/machine");
      return;
    }
    const projects: Array<{ has_active_project?: boolean }> = Array.isArray(projectsJson?.projects)
      ? projectsJson.projects
      : [];
    const hasActive = projects.some((p) => Boolean(p?.has_active_project));
    router.replace(hasActive ? "/dashboard" : "/machine");
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
    <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/80 p-8 shadow-2xl shadow-emerald-200/40 backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
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
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm tracking-[0.4em] text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        )}

        {message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-xs ${
              status === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={status === "loading"}
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
            className="text-emerald-600 hover:text-emerald-700"
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
            className="text-emerald-600 hover:text-emerald-700"
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
