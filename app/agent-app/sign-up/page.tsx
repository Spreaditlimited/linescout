"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "../_components/AuthShell";
import styles from "../_components/AgentAuth.module.css";

function clean(v: unknown) {
  return String(v ?? "").trim();
}
function normEmail(v: unknown) {
  return clean(v).toLowerCase();
}
function normUsername(v: unknown) {
  return clean(v).toLowerCase();
}
function isValidEmail(x: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}
function isValidUsername(x: string) {
  return /^[a-z0-9._-]{3,30}$/.test(x);
}

export default function AgentAppSignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const fn = clean(firstName);
    const ln = clean(lastName);
    const em = normEmail(email);
    const un = normUsername(username);
    const pw = clean(password);

    if (!fn || !ln || !em || !un || !pw) return false;
    if (pw.length < 8) return false;
    if (!isValidEmail(em)) return false;
    if (!isValidUsername(un)) return false;
    return !busy;
  }, [firstName, lastName, email, username, password, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setBusy(true);
    try {
      const res = await fetch("/api/internal/auth/signup-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          first_name: clean(firstName),
          last_name: clean(lastName),
          email: normEmail(email),
          username: normUsername(username),
          password: clean(password),
        }),
      });

      const rawText = await res.text().catch(() => "");
      let data: any = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data?.ok) {
        const raw =
          String(data?.error || data?.message || data?.detail || "").trim() ||
          (Array.isArray(data?.errors) ? data.errors.join(", ") : "") ||
          rawText.trim();
        if (res.status === 409) {
          setError("This email already has an account. Please sign in instead.");
          return;
        }
        const fallback = `Signup failed (${res.status})`;
        setError(raw ? `(${res.status}) ${raw}` : fallback);
        return;
      }

      const userId = Number(data?.user_id || 0);
      if (!userId) {
        setError("Signup succeeded but user_id was not returned.");
        return;
      }

      let mode = "phone";
      try {
        const modeRes = await fetch("/api/internal/agents/auth/otp-mode", { cache: "no-store" });
        const modeJson = await modeRes.json().catch(() => null);
        if (modeRes.ok && modeJson?.ok) {
          mode = String(modeJson.mode || "phone");
        }
      } catch {}

      const target = mode === "email" ? "email-verify" : "phone-verify";
      const emailParam = mode === "email" ? `&email=${encodeURIComponent(normEmail(email))}` : "";
      router.replace(`/agent-app/${target}?user_id=${userId}&post=inbox${emailParam}`);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Join the LineScout agent workspace. Approval is required to access live handoffs."
      topSlot={
        <Link href="/agent-app" >
          Back to agent app
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label  htmlFor="agent-sign-up-1">First name</label>
          <input id="agent-sign-up-1"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              autoComplete="given-name"

            />
          </div>
          <div>
            <label  htmlFor="agent-sign-up-2">Last name</label>
          <input id="agent-sign-up-2"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Okafor"
              autoComplete="family-name"

            />
          </div>
        </div>

        <div>
          <label  htmlFor="agent-sign-up-3">Email</label>
          <input id="agent-sign-up-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@email.com"
            autoComplete="email"

          />
        </div>

        <div>
          <label  htmlFor="agent-sign-up-4">Username</label>
          <input id="agent-sign-up-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="agent.okafor"
            autoComplete="username"

          />
          <p className="mt-2 text-xs text-neutral-500">Allowed: letters, numbers, dot, underscore, hyphen. 3 to 30 characters.</p>
        </div>

        <div>
          <label  htmlFor="agent-sign-up-5">Password</label>
          <input id="agent-sign-up-5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Minimum 8 characters"
            autoComplete="new-password"

          />
        </div>

        {error ? (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Already have an account? <Link  href="/agent-app/sign-in">Sign in</Link>.
      </p>
    </AuthShell>
  );
}
