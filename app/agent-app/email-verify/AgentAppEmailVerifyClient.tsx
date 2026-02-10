"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "../_components/AuthShell";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function AgentAppEmailVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get("user_id") || 0);
  const post = searchParams.get("post");
  const emailParam = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSend = useMemo(() => userId > 0 && clean(email).includes("@"), [userId, email]);
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
        body: JSON.stringify({ user_id: userId, email: clean(email) }),
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
        body: JSON.stringify({ user_id: userId, email: clean(email), otp: clean(otp) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Verify failed (${res.status})`));
        return;
      }

      if (post === "app") {
        router.replace("/agent-app/inbox");
      } else {
        router.replace("/agent-app/sign-in");
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthShell
      title="Verify email"
      subtitle="Confirm your email address to access the agent workspace."
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@email.com"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>
        <button
          type="button"
          onClick={requestOtp}
          disabled={!canSend || sending}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 disabled:opacity-60"
        >
          {sending ? "Sending OTP…" : "Send OTP"}
        </button>

        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">OTP</label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
            />
          </div>

          {info ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              {info}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canVerify || verifying}
            className="w-full rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
          >
            {verifying ? "Verifying…" : "Verify email"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
