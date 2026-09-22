"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import AuthShell from "../_components/AuthShell";
import styles from "../_components/AgentAuth.module.css";

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
          <label  htmlFor="agent-forgot-password-1">
            Email or username
          </label>
          <input id="agent-forgot-password-1"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="agent@email.com or agent.okafor"
            autoComplete="username"

          />
        </div>

        {error ? (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        ) : null}

        {success ? (
          <div role="status" className={styles.success}>
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full"
        >
          {busy ? "Sending…" : "Send reset"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Go back to <Link  href="/agent-app/sign-in">sign in</Link>.
      </p>
    </AuthShell>
  );
}
