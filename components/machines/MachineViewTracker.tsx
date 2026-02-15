"use client";

import { useEffect } from "react";

export default function MachineViewTracker({
  machineId,
  slug,
}: {
  machineId?: number | null;
  slug?: string | null;
}) {
  useEffect(() => {
    if (!machineId && !slug) return;
    fetch("/api/machines/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine_id: machineId, slug }),
      keepalive: true,
    }).catch(() => {});
  }, [machineId, slug]);

  return null;
}

