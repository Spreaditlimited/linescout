"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function InternalSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const defaultNext = "/internal/agent-handoffs";
  const next = nextParam || defaultNext;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/internal/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: username.trim(), // API still expects `email`
          password,
          app: "admin",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Sign-in failed.");
        return;
      }

      // decide landing page based on permissions
      const meRes = await fetch("/internal/auth/me", { cache: "no-store" });
      const me = await meRes.json().catch(() => null);

      const canLeads = !!me?.user?.permissions?.can_view_leads;
      const canHandoffs = !!me?.user?.permissions?.can_view_handoffs;

      const target = canHandoffs
        ? "/internal/agent-handoffs"
        : canLeads
        ? "/internal/leads"
        : "/internal/sign-in?next=/internal/agent-handoffs";

      router.replace(nextParam || target);

    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 shadow-xl">
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">LineScout Admin</h1>
              <p className="text-sm text-neutral-400 mt-1">
                Sign in to manage Leads and Handoffs.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-neutral-300">Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  type="text"
                  autoComplete="username"
                  className="mt-2 w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="Admin username"
                />
              </div>

              <div>
                <label className="text-sm text-neutral-300">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
                  placeholder="••••••••••"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                disabled={busy}
                className="w-full rounded-xl bg-white text-neutral-950 font-medium py-2.5 hover:bg-neutral-200 disabled:opacity-60"
              >
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-xs text-neutral-500 mt-4 text-center">
          Internal access only.
        </p>
      </div>
    </div>
  );
}
