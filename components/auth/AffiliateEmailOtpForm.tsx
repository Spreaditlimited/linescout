"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect from "@/app/internal/_components/SearchableSelect";

type Step = "email" | "otp";
type Country = { id: number; name: string; iso2: string; currency_code?: string | null };

function isValidEmail(value: string) {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function AffiliateEmailOtpForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        value: String(c.id),
        label: `${c.name} (${c.iso2})`,
      })),
    [countries]
  );
  const canSubmitEmail = isValidEmail(email) && status !== "loading";

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalHeight = document.body.style.height;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100dvh";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.height = originalHeight;
      document.body.style.overscrollBehavior = originalOverscroll;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/affiliates/metadata", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!active) return;
      if (res.ok && json?.ok && Array.isArray(json.countries)) {
        setCountries(json.countries);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function requestOtp() {
    setStatus("loading");
    setMessage(null);

    if (!isValidEmail(email)) {
      setStatus("error");
      setMessage("Enter a valid email address.");
      return false;
    }

    const res = await fetch("/api/affiliates/auth/request-otp", {
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

    setNeedsProfile(!!json?.needs_profile);
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

    const res = await fetch("/api/affiliates/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email,
        otp,
        name: needsProfile ? name : undefined,
        country_id: needsProfile ? Number(countryId || 0) : undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "Invalid code. Please try again.");
      return;
    }

    window.location.href = "/affiliates/dashboard";
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/80 p-8 shadow-2xl shadow-[rgba(45,52,97,0.25)] backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">LineScout</p>
        <h1 className="text-3xl font-semibold text-neutral-900">Become an Affiliate</h1>
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

        {step === "otp" && needsProfile ? (
          <>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Full name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Country</label>
              <SearchableSelect
                value={countryId}
                onChange={(value) => setCountryId(value)}
                options={countryOptions}
                placeholder="Select country"
                variant="light"
              />
            </div>
          </>
        ) : null}

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
          disabled={
            step === "email"
              ? !canSubmitEmail
              : status === "loading" || (needsProfile && (!name || !countryId))
          }
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
