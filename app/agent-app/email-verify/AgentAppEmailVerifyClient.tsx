"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "../_components/AuthShell";
import styles from "../_components/AgentAuth.module.css";
import { getSafeNextPath } from "@/lib/safe-next-path";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function AgentAppEmailVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get("user_id") || 0);
  const post = searchParams.get("post");
  const safeNext = getSafeNextPath(searchParams.get("next"));
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
        router.replace(safeNext || "/agent-app/inbox");
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
          <label  htmlFor="agent-email-verify-1">Email</label>
          <input id="agent-email-verify-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@email.com"

          />
        </div>
        <button
          type="button"
          onClick={requestOtp}
          disabled={!canSend || sending}
          className="w-full"
        >
          {sending ? "Sending OTP…" : "Send OTP"}
        </button>

        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label  htmlFor="agent-email-verify-2">OTP</label>
          <input id="agent-email-verify-2"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"

            />
          </div>

          {info ? (
            <div role="status" className={styles.notice}>
              {info}
            </div>
          ) : null}
          {error ? (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canVerify || verifying}
            className="w-full"
          >
            {verifying ? "Verifying…" : "Verify email"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
