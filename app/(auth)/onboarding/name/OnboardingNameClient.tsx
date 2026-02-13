"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

export default function OnboardingNameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function routeAfterProfile() {
    const nextParam = String(searchParams.get("next") || "").trim();
    let safeNext =
      nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
    if (safeNext === "/white-label" || safeNext.startsWith("/white-label?")) {
      safeNext = "/white-label/ideas";
    }
    if (safeNext) {
      router.replace(safeNext);
      return;
    }

    const aiRoutes = ["machine_sourcing", "white_label", "simple_sourcing"];
    let aiStarted = false;
    try {
      const results = await Promise.all(
        aiRoutes.map(async (routeType) => {
          const res = await authFetch(`/api/mobile/conversations/list?route_type=${routeType}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !Array.isArray(json?.items)) return false;
          return json.items.some((c: any) => {
            const mode = String(c?.chat_mode || "");
            if (mode !== "ai_only" && mode !== "limited_human") return false;
            const lastText = String(c?.last_message_text || "").trim();
            const lastAt = String(c?.last_message_at || "").trim();
            return Boolean(lastText || lastAt);
          });
        })
      );
      aiStarted = results.some(Boolean);
    } catch {
      aiStarted = false;
    }

    if (aiStarted) {
      router.replace("/machine");
      return;
    }

    let hasActiveProject = false;
    try {
      const res = await authFetch("/api/mobile/projects");
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.projects)) {
        hasActiveProject = json.projects.some((p: any) => String(p?.conversation_status) === "active");
      }
    } catch {
      hasActiveProject = false;
    }

    router.replace(hasActiveProject ? "/projects/active" : "/white-label/ideas");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    let fbclid = "";
    let fbc = "";
    let fbp = "";
    try {
      fbclid = window.localStorage.getItem("linescout_fbclid") || "";
      fbc = window.localStorage.getItem("linescout_fbc") || "";
      fbp = window.localStorage.getItem("linescout_fbp") || "";
    } catch {}

    const res = await authFetch("/api/mobile/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone: "",
        fbclid: fbclid || null,
        fbc: fbc || null,
        fbp: fbp || null,
      }),
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
