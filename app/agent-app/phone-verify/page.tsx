import { Suspense } from "react";
import AuthShell from "../_components/AuthShell";
import AgentAppPhoneVerifyClient from "./AgentAppPhoneVerifyClient";

function Fallback() {
  return (
    <AuthShell
      title="Verify phone"
      subtitle="Confirm your phone number to access the agent workspace."
    >
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
        Loading…
      </div>
    </AuthShell>
  );
}

export default function AgentAppPhoneVerifyPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentAppPhoneVerifyClient />
    </Suspense>
  );
}
