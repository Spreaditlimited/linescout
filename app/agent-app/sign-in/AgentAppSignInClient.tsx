"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "../_components/AuthShell";
import { fetchAgentOtpMode } from "../lib/otp";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function AgentAppSignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return clean(login).length > 0 && clean(password).length >= 8 && !busy;
  }, [login, password, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setBusy(true);
    try {
      const res = await fetch("/api/internal/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ login: clean(login), password: clean(password), app: "agent" }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Login failed (${res.status})`));
        return;
      }

      const meRes = await fetch("/api/internal/auth/me", { cache: "no-store", credentials: "include" });
      const me = await meRes.json().catch(() => null);

      if (!meRes.ok || !me?.ok) {
        setError(String(me?.error || `Failed to load profile (${meRes.status})`));
        return;
      }

      const role = String(me?.user?.role || "").toLowerCase();
      const otpMode = await fetchAgentOtpMode();
      const emailVerified = !!me?.user?.email_verified;
      const phoneVerified = !!(me?.user?.phone_verified ?? me?.user?.otp_verified);
      const otpVerified = otpMode === "email" ? emailVerified : phoneVerified;
      const userId = Number(me?.user?.id || 0);
      const email = String(me?.user?.email || "");

      if (role === "admin") {
        setError("Admin accounts cannot sign into the agent app.");
        return;
      }

      if (role === "agent" && !otpVerified && userId > 0) {
        const target = otpMode === "email" ? "email-verify" : "phone-verify";
        const emailParam = email ? `&email=${encodeURIComponent(email)}` : "";
        router.replace(`/agent-app/${target}?user_id=${userId}&post=app${emailParam}`);
        return;
      }

      if (role === "agent") {
        router.replace(nextParam || "/agent-app/inbox");
        return;
      }

      setError("Access denied for this account.");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your LineScout agent credentials to access the workspace."
      topSlot={
        <Link href="/agent-app" className="btn btn-ghost text-xs">
          ← Back to agent app
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Username or email
          </label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="agent.okafor or agent@email.com"
            autoComplete="username"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <Link href="/agent-app/forgot-password" className="font-semibold text-neutral-500 hover:text-neutral-900">
            Forgot password?
          </Link>
          <Link href="/agent-app/sign-up" className="font-semibold text-[#2D3461] hover:text-[#1f2548]">
            Create account
          </Link>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Not approved yet? Review the <Link className="text-[#2D3461] font-semibold" href="/agents">agent agreement</Link>.
      </p>
    </AuthShell>
  );
}
