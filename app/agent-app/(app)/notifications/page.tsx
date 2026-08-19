"use client";

import AgentAppShell from "../_components/AgentAppShell";

export default function NotificationsPage() {
  return (
    <AgentAppShell title="Notifications" subtitle="Stay on top of updates and escalations.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          Coming next: data feed and actions for notifications.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          Notification history and actions are being prepared for this workspace.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          Use the sidebar to move between agent tools.
        </div>
      </div>
    </AgentAppShell>
  );
}
