"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const navItems = [
  { label: "Dashboard", href: "/agent-app/dashboard" },
  { label: "Inbox", href: "/agent-app/inbox" },
  { label: "Projects", href: "/agent-app/projects" },
  { label: "Quote builder", href: "/agent-app/quote-builder" },
  { label: "Payouts", href: "/agent-app/payouts" },
  { label: "Notifications", href: "/agent-app/notifications" },
  { label: "Profile", href: "/agent-app/profile" },
  { label: "Settings", href: "/agent-app/settings" },
  { label: "Sign out", href: "/agent-app/sign-out" },
];

export default function AgentAppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = useMemo(() => pathname || "", [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top bar (mobile + desktop) */}
      <div className="sticky top-0 z-40 border-b border-[rgba(45,52,97,0.14)] bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(45,52,97,0.2)] text-lg text-[#2D3461] lg:hidden"
            aria-label="Open navigation"
          >
            ≡
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <Image src="/linescout-logo.png" alt="LineScout" width={120} height={28} className="h-7 w-auto" />
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[#2D3461]">Agent</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.2)] bg-[#F4F7FB] px-4 py-2 text-sm text-neutral-500">
              <span className="text-base">⌕</span>
              <span className="text-neutral-400">Search here…</span>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(45,52,97,0.2)] text-lg text-[#2D3461]"
            aria-label="Toggle theme"
          >
            ☼
          </button>
          <div className="h-10 w-10 overflow-hidden rounded-full border border-[rgba(45,52,97,0.2)] bg-[#E6EDF6]" aria-label="Profile">
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#2D3461]">
              AG
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMobileOpen(false);
            }}
          />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-xs bg-[#0B0B0E] p-6 shadow-2xl animate-[slideIn_220ms_ease-out]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image src="/linescout-logo.png" alt="LineScout" width={120} height={28} className="h-6 w-auto" />
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-white/60"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            <nav className="mt-8 space-y-2">
              {navItems.map((item) => {
                const isActive = active === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive ? <span className="text-xs text-white/60">Active</span> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 pb-8 pt-5 sm:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <aside className="hidden w-full rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] lg:block lg:w-[280px] lg:shrink-0 lg:self-start lg:h-fit">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#2D3461]">Agent menu</p>
          <p className="mt-1 text-xs text-neutral-500">Navigate your workspace</p>

          <nav className="mt-3 space-y-0.5">
            {navItems.map((item) => {
              const isActive = active === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-[#2D3461] text-white"
                      : "text-neutral-600 hover:bg-[rgba(45,52,97,0.08)] hover:text-neutral-900"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive ? <span className="text-xs text-white/70">Active</span> : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1">
          <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#2D3461]">Agent app</p>
                <h1 className="mt-2 text-xl font-semibold text-neutral-900 sm:text-2xl lg:text-3xl">{title}</h1>
                {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
              </div>
              <div className="hidden items-center gap-3 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.06)] px-3 py-2 text-xs text-neutral-600 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live agent workspace
              </div>
            </div>

            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
