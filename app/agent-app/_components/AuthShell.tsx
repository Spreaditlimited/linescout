"use client";

import type { ReactNode } from "react";
export default function AuthShell({
  title,
  subtitle,
  topSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  topSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-neutral-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-180px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.22),transparent_65%)]" />
        <div className="absolute right-[-120px] top-[140px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.16),transparent_65%)]" />
        <div className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.18),transparent_70%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <section className="grid flex-1 items-center">
          <div className="mx-auto w-full max-w-md">
            {topSlot ? <div className="mb-4">{topSlot}</div> : null}
            <div className="rounded-[28px] border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#2D3461]">
                LineScout Agent
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{title}</h1>
              {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
              <div className="mt-6 space-y-4">{children}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
