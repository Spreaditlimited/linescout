"use client";

import { useState } from "react";
import { CheckCircle2, Mail, X } from "lucide-react";

type Status = "idle" | "submitting" | "success" | "error";

type WebinarLeadFormProps = {
  endpoint: string;
  page: string;
  dialogId: string;
  seminarName: string;
};

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

export default function WebinarLeadForm({ endpoint, page, dialogId, seminarName }: WebinarLeadFormProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "success" | "duplicate">(null);

  const canSubmit = name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(email.trim()) && status !== "submitting";
  const nameId = `${dialogId}-name`;
  const emailId = `${dialogId}-email`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          sessionId: getLineScoutSessionId(),
          meta: { page },
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        if (json?.code === "already-registered") {
          setStatus("idle");
          setModal("duplicate");
          return;
        }
        setStatus("error");
        setError(json?.error || "We could not send your access link. Please try again.");
        return;
      }

      try {
        window.localStorage.setItem("linescout_lead_name", name.trim());
        window.localStorage.setItem("linescout_lead_email", email.trim());
      } catch {
        // Registration is complete even when local storage is unavailable.
      }

      setStatus("success");
      setModal(json?.already_registered ? "duplicate" : "success");
    } catch {
      setStatus("error");
      setError("We could not reach the registration service. Check your connection and try again.");
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div>
          <label htmlFor={nameId} className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Full name
          </label>
          <input
            id={nameId}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your full name"
            autoComplete="name"
            required
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor={emailId} className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Email address
          </label>
          <input
            id={emailId}
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-describedby={error ? `${dialogId}-error` : undefined}
            aria-invalid={Boolean(error)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {error ? (
          <div id={`${dialogId}-error`} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 sm:col-span-2">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {status === "submitting" ? "Sending your link..." : "Email me the free seminar"}
        </button>

        <p className="text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400 sm:col-span-2">
          No payment required. We use your details to deliver access and relevant Sure Imports updates.
        </p>
      </form>

      {modal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${dialogId}-title`}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              aria-label="Close confirmation"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h2 id={`${dialogId}-title`} className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">
              {modal === "duplicate" ? "Your access email is on its way again." : "Your private access is ready."}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              We sent the {seminarName} link to <strong className="text-slate-950 dark:text-white">{email.trim()}</strong>.
              Check your inbox and spam folder. The private link remains valid for 30 days.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800"
              onClick={() => setModal(null)}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
