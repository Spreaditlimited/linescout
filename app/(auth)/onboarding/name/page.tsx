"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

export default function OnboardingNamePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function routeAfterProfile() {
    const projectsRes = await authFetch("/api/mobile/projects");
    const projectsJson = await projectsRes.json().catch(() => ({}));
    if (!projectsRes.ok) {
      router.replace("/machine");
      return;
    }
    const projects: Array<{ has_active_project?: boolean }> = Array.isArray(projectsJson?.projects)
      ? projectsJson.projects
      : [];
    const hasActive = projects.some((p) => Boolean(p?.has_active_project));
    router.replace(hasActive ? "/dashboard" : "/machine");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    const res = await authFetch("/api/mobile/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: "" }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "We could not save your profile. Try again.");
      return;
    }

    await routeAfterProfile();
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white/80 p-8 shadow-2xl shadow-emerald-200/40 backdrop-blur">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">LineScout</p>
        <h1 className="text-3xl font-semibold text-neutral-900">Tell us your name</h1>
        <p className="text-sm text-neutral-600">
          We use this to personalize your projects and quotes.
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">First name</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ada"
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600">Last name</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Okafor"
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        {message ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
