import { Suspense } from "react";
import QuoteBuilderClient from "./QuoteBuilderClient";
import AgentAppShell from "../_components/AgentAppShell";

function Fallback() {
  return (
    <AgentAppShell title="Quote builder" subtitle="Loading quote builder…">
      <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        Loading…
      </div>
    </AgentAppShell>
  );
}

export default function QuoteBuilderPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <QuoteBuilderClient />
    </Suspense>
  );
}
