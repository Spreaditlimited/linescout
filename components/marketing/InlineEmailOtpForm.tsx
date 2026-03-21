"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type Step = "email" | "otp";

function isValidEmail(value: string) {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function InlineEmailOtpForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const canSubmitEmail = isValidEmail(email) && status !== "loading";
  const emailLooksValid = isValidEmail(email);

  async function routeAfterProfile() {
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

    if (hasActiveProject) {
      router.replace("/projects/active");
      return;
    }

    router.replace("/projects/new");
  }

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
    setMessage("Code sent. Check your inbox.");
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
      router.replace("/onboarding/name?next=%2Fprojects%2Fnew");
      return;
    }

    await routeAfterProfile();
  }

  return (
    <form
      className="mt-5 max-w-xl space-y-3 rounded-[22px] border border-neutral-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.1)] sm:p-5"
      onSubmit={step === "email" ? handleRequestOtp : handleVerifyOtp}
    >
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
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm tracking-[0.35em] text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
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
            ? emailLooksValid
              ? "Send code"
              : "Create a Free Account"
            : "Verify and continue"}
      </button>

      {step === "otp" ? (
        <div className="flex items-center justify-between gap-3 text-xs text-neutral-600">
          <button
            type="button"
            className="text-[var(--agent-blue)] hover:text-[var(--agent-blue)]"
            onClick={() => {
              setStep("email");
              setOtp("");
              setStatus("idle");
              setMessage(null);
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
    </form>
  );
}
