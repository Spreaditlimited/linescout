"use client";

import { useEffect, useState } from "react";

export default function DeferredSection({
  children,
  className,
  minHeight = 220,
  delayMs = 1200,
}: {
  children: React.ReactNode;
  className?: string;
  minHeight?: number;
  delayMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const show = () => {
      if (cancelled) return;
      setReady(true);
    };

    if (typeof (window as any).requestIdleCallback === "function") {
      const id = (window as any).requestIdleCallback(show, { timeout: delayMs });
      return () => {
        cancelled = true;
        if (typeof (window as any).cancelIdleCallback === "function") {
          (window as any).cancelIdleCallback(id);
        }
      };
    }

    timer = setTimeout(show, delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [delayMs]);

  if (ready) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      <div
        className="rounded-[24px] border border-neutral-200 bg-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
        style={{ minHeight }}
      />
    </div>
  );
}
