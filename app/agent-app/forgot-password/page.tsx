"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import AuthShell from "../_components/AuthShell";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default function AgentAppForgotPasswordPage() {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => clean(login).length >= 3 && !busy, [login, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canSubmit) return;

    setBusy(true);
    try {
      const res = await fetch("/api/internal/agents/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ login: clean(login) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || `Request failed (${res.status})`));
        return;
      }
      setSuccess("If the account exists, a reset email has been sent.");
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We will email a temporary password if the account exists."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Email or username
          </label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="agent@email.com or agent.okafor"
            autoComplete="username"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none focus:border-[#2D3461]"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-[#2D3461] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.3)] disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send reset"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Go back to <Link className="text-[#2D3461] font-semibold" href="/agent-app/sign-in">sign in</Link>.
      </p>
    </AuthShell>
  );
}
