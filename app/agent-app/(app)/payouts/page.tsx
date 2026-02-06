"use client";

import AgentAppShell from "../_components/AgentAppShell";

export default function PayoutsPage() {
  return (
    <AgentAppShell title="Payouts" subtitle="Review commissions and submit payout requests.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          Coming next: data feed and actions for payouts.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          We will mirror the agent mobile app endpoints here.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          Use the sidebar to move between agent tools.
        </div>
      </div>
    </AgentAppShell>
  );
}
