import { Suspense } from "react";
import AgentAppSignInClient from "./AgentAppSignInClient";
import AuthShell from "../_components/AuthShell";

function Fallback() {
  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your LineScout agent credentials to access the workspace."
    >
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
        Loading…
      </div>
    </AuthShell>
  );
}

export default function AgentAppSignInPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentAppSignInClient />
    </Suspense>
  );
}
