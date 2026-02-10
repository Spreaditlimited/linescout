import { Suspense } from "react";
import AuthShell from "../_components/AuthShell";
import AgentAppEmailVerifyClient from "./AgentAppEmailVerifyClient";

function Fallback() {
  return (
    <AuthShell
      title="Verify email"
      subtitle="Confirm your email address to access the agent workspace."
    >
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
        Loading…
      </div>
    </AuthShell>
  );
}

export default function AgentAppEmailVerifyPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentAppEmailVerifyClient />
    </Suspense>
  );
}
