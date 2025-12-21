"use client";

import { useEffect, useState } from "react";
import AgentsPanel from "../_components/AgentsPanel";

type MeResponse =
  | { ok: true; user: { username: string; role: string } }
  | { ok: false; error: string };

export default function InternalSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    fetch("/internal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ ok: false, error: "Failed to load session" }));
  }, []);

  const isAdmin = !!(me && "ok" in me && me.ok && me.user.role === "admin");

  if (!me) {
    return <p className="text-sm text-neutral-400">Loading...</p>;
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
        <p className="mt-1 text-sm text-neutral-400">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Admin controls: agents, access, credentials, and future admin features.
        </p>
      </div>

      <AgentsPanel />
    </div>
  );
}