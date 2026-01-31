import AgentsPanel from "../_components/AgentsPanel";

export default function InternalAgentsPage() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-semibold text-neutral-100">Agents</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Review agent registrations, approve access to projects (handoffs), deactivate accounts, and reset credentials.
        </p>
      </div>

      <AgentsPanel />
    </div>
  );
}