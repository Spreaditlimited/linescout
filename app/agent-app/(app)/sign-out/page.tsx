"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AgentAppShell from "../_components/AgentAppShell";

export default function AgentAppSignOutPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      await fetch("/api/internal/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => null);
      router.replace("/agent-app/sign-in");
    }
    run();
  }, [router]);

  return (
    <AgentAppShell title="Signing out" subtitle="Closing your session.">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        Signing you out…
      </div>
    </AgentAppShell>
  );
}
