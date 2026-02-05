"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

type ProfileResponse = {
  ok?: boolean;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  error?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setMessage(null);
      const res = await authFetch("/api/mobile/profile");
      const json: ProfileResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (active) {
          setStatus("error");
          setMessage(json?.error || "Unable to load profile.");
        }
        return;
      }
      if (active) {
        setEmail(String(json?.email || ""));
        setFirstName(String(json?.first_name || ""));
        setLastName(String(json?.last_name || ""));
        setPhone(String(json?.phone || ""));
        setStatus("idle");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSignOut() {
    await authFetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/sign-in");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage(null);

    const res = await authFetch("/api/mobile/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
    });

    const json: ProfileResponse = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setStatus("error");
      setMessage(json?.error || "Unable to save profile.");
      return;
    }

    setEmail(String(json?.email || email));
    setFirstName(String(json?.first_name || firstName));
    setLastName(String(json?.last_name || lastName));
    setPhone(String(json?.phone || phone));
    setStatus("idle");
    setMessage("Profile updated.");
  }

  return (
    <div className="px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Profile</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Update your personal details. Phone number is required for virtual accounts.
        </p>
      </div>

      <div className="mt-6 max-w-xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Personal details</p>
          {firstName && lastName && phone ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Completed
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Incomplete
            </span>
          )}
        </div>

        {status === "loading" ? (
          <p className="mt-3 text-sm text-neutral-600">Loading profile…</p>
        ) : null}

        {status === "error" ? (
          <p className="mt-3 text-sm text-red-600">{message}</p>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 shadow-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">First name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
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
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-600">Phone number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 801 234 5678"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          {message && status === "idle" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === "saving"}
          >
            {status === "saving" ? "Saving..." : "Save changes"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Session</p>
          <p className="mt-2 text-sm text-neutral-600">Sign out of your LineScout account on this device.</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="btn btn-outline mt-3 px-4 py-2 text-xs"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
