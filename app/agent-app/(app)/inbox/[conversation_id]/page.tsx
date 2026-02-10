import { Suspense } from "react";
import AgentInboxClient from "./AgentInboxClient";
import AgentAppShell from "../../_components/AgentAppShell";

function Fallback() {
  return (
    <AgentAppShell title="Chat" subtitle="Loading conversation…">
      <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        Loading…
      </div>
    </AgentAppShell>
  );
}

export default function AgentInboxPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AgentInboxClient />
    </Suspense>
  );
}
