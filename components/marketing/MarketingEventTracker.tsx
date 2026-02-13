"use client";

import { useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-client";

type MarketingEventTrackerProps = {
  eventType: string;
  relatedId?: string | null;
  meta?: Record<string, any> | null;
};

export default function MarketingEventTracker({ eventType, relatedId, meta }: MarketingEventTrackerProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!eventType || sentRef.current) return;
    sentRef.current = true;
    (async () => {
      try {
        await authFetch("/api/mobile/marketing-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: eventType,
            related_id: relatedId || null,
            meta: meta || null,
          }),
        });
      } catch {
        // Silent: marketing telemetry should not block UX.
      }
    })();
  }, [eventType, relatedId, meta]);

  return null;
}
