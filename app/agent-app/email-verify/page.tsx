"use client";

import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "../_components/AuthShell";

function clean(v: unknown) {
  return String(v ?? "").trim();
}
function normEmail(v: unknown) {
  return clean(v).toLowerCase();
}

function AgentAppEmailVerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get("user_id") || 0);
  const post = searchParams.get("post");
  const presetEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(presetEmail);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSend = useMemo(() => {
    const em = normEmail(email);
    return userId > 0 && em.includes("@");
  }, [userId, email]);

  const canVerify = useMemo(() => canSend && clean(otp).length === 6, [canSend, otp]);

  async function requestOtp() {
    if (!canSend || sending) return;
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const res = await fetch("/api/internal/agents/email/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: userId, email: normEmail(email) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Request failed (${res.status})`));
        return;
      }
      if (data?.dev_otp) {
        setInfo(`OTP sent (dev): ${String(data.dev_otp)}`);
      } else {
        setInfo("OTP sent. Check your email for the code.");
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!canVerify || verifying) return;
    setError(null);
    setInfo(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/internal/agents/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: userId, email: normEmail(email), otp: clean(otp) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Verify failed (${res.status})`));
        return;
      }

      if (post === "back") {
        router.back();
        return;
      }

      router.replace("/agent-app/inbox");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setVerifying(false);
    }
  }

  if (!userId) {
    return (
      <AuthShell
        title="Verify email"
        subtitle="Missing user id. Please sign in again to continue verification."
      >
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          We could not determine your agent account. Return to sign in and try again.
        </div>
        <a
          href="/agent-app/sign-in"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)]"
        >
          Back to sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verify email"
      subtitle="We’ll send a 6-digit OTP to secure your agent account."
    >
      <form onSubmit={verifyOtp} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@email.com"
            inputMode="email"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>

        <button
          type="button"
          onClick={requestOtp}
          disabled={!canSend}
          className="w-full rounded-2xl border border-[#2D3461]/30 bg-white px-4 py-3 text-sm font-semibold text-[#2D3461] disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send OTP"}
        </button>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">OTP code</label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
            {info}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canVerify}
          className="w-full rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
        >
          {verifying ? "Verifying…" : "Verify"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">If you don’t receive the OTP, try again after 30 seconds.</p>
    </AuthShell>
  );
}

export default function AgentAppEmailVerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title="Verify email"
          subtitle="We’ll send a 6-digit OTP to secure your agent account."
        >
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
            Loading…
          </div>
        </AuthShell>
      }
    >
      <AgentAppEmailVerifyInner />
    </Suspense>
  );
}
