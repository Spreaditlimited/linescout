"use client";

import { useMemo, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

function getLineScoutSessionId() {
  const key = "linescout_session_id";
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(key);
  if (!id) {
    try {
      id = crypto.randomUUID();
    } catch {
      id = Math.random().toString(36).slice(2);
    }
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function MachineWebinarLeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "success" | "duplicate">(null);

  const canSubmit = useMemo(() => {
    return name.trim().length > 1 && email.includes("@") && status === "idle";
  }, [name, email, status]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);

    const sessionId = getLineScoutSessionId();

    const res = await fetch("/api/machine-sourcing-webinar/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        sessionId,
        meta: { page: "machine-sourcing-webinar" },
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      if (json?.code === "already-registered") {
        setStatus("idle");
        setError(null);
        setModal("duplicate");
        return;
      }
      setStatus("error");
      setError(json?.error || "Could not save your details. Please try again.");
      return;
    }

    try {
      window.localStorage.setItem("linescout_lead_name", name.trim());
      window.localStorage.setItem("linescout_lead_email", email.trim());
    } catch {
      // ignore storage errors
    }

    setStatus("success");
    setModal("success");
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Full name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Email address
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            type="email"
            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-[rgba(45,52,97,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(45,52,97,0.18)]"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn btn-primary w-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Saving..." : "Get Free Access"}
        </button>

        <p className="text-xs text-neutral-500">
          Instant access after signup. We never share your email.
        </p>
      </form>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="machine-webinar-thank-you-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
            <p
              id="machine-webinar-thank-you-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {modal === "duplicate" ? "You are already registered." : "Congratulations. You are in."}
            </p>
            <p className="mt-2 text-base font-semibold text-neutral-900">
              Check your email (including spam) for the webinar link and details. Click the link to
              join the webinar. <span className="text-red-600">Webinar expires soon.</span>
            </p>
            <button
              type="button"
              className="btn btn-primary mt-5 w-full px-4 py-2 text-sm"
              onClick={() => setModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
