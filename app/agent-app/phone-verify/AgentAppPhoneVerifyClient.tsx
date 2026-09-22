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
function normPhone(v: unknown) {
  return clean(v).replace(/\s+/g, "");
}

export default function AgentAppPhoneVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = Number(searchParams.get("user_id") || 0);
  const post = searchParams.get("post");
  const safeNext = getSafeNextPath(searchParams.get("next"));

  const [phone, setPhone] = useState("+86");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSend = useMemo(() => {
    const p = normPhone(phone);
    return userId > 0 && p.startsWith("+86") && p.length >= 10;
  }, [userId, phone]);

  const canVerify = useMemo(() => canSend && clean(otp).length === 6, [canSend, otp]);

  async function requestOtp() {
    if (!canSend || sending) return;
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const res = await fetch("/api/internal/agents/phone/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: userId, phone: normPhone(phone) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Request failed (${res.status})`));
        return;
      }
      if (data?.dev_otp) {
        setInfo(`OTP sent (dev): ${String(data.dev_otp)}`);
      } else {
        setInfo("OTP sent. Check your phone for the code.");
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
      const res = await fetch("/api/internal/agents/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: userId, phone: normPhone(phone), otp: clean(otp) }),
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
      title="Verify phone"
      subtitle="Confirm your phone number to access the agent workspace."
    >
      <div className="space-y-4">
        <div>
          <label  htmlFor="agent-phone-verify-1">
            Phone number
          </label>
          <input id="agent-phone-verify-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+86"

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
            <label  htmlFor="agent-phone-verify-2">OTP</label>
          <input id="agent-phone-verify-2"
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
            {verifying ? "Verifying…" : "Verify phone"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
