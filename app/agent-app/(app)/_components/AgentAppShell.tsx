"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FolderKanban,
  RotateCcw,
  FileText,
  Wallet,
  Bell,
  User,
  Settings,
  ArrowLeft,
} from "lucide-react";

const navItems = [
  { href: "/agent-app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agent-app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/agent-app/projects", label: "Projects", icon: FolderKanban },
  { href: "/agent-app/reorders", label: "Reorders", icon: RotateCcw },
  { href: "/agent-app/quote-builder", label: "Quote builder", icon: FileText },
  { href: "/agent-app/payouts", label: "Payouts", icon: Wallet },
  { href: "/agent-app/notifications", label: "Notifications", icon: Bell },
  { href: "/agent-app/profile", label: "Profile", icon: User },
  { href: "/agent-app/settings", label: "Settings", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
        active
          ? "bg-[var(--agent-blue)] text-white shadow-lg shadow-[rgba(45,52,97,0.25)]"
          : "text-neutral-700 hover:bg-[rgba(45,52,97,0.08)] hover:text-[var(--agent-blue)]"
      }`}
    >
      <Icon
        className={`h-4 w-4 ${
          active ? "text-white" : "text-neutral-500 group-hover:text-[var(--agent-blue)]"
        }`}
      />
      {label}
    </Link>
  );
}

export default function AgentAppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [showSignOut, setShowSignOut] = useState(false);
  const brandBlue = "#2D3461";

  const signOut = async () => {
    await fetch("/api/internal/auth/sign-out", { method: "POST", credentials: "include" });
    router.replace("/agent-app/sign-in");
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/agent-app/dashboard");
  };

  return (
    <div
      className="app-theme-blue min-h-screen bg-[#F5F6FA] text-neutral-900"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 lg:py-8">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 self-start rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] lg:flex h-fit">
          <div className="px-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              LineScout
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">Agent App</p>
          </div>
          <nav className="mt-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
          <div className="mt-auto px-2 pb-2">
            <button
              type="button"
              onClick={() => setShowSignOut(true)}
              className="btn btn-outline w-full px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-4 space-y-3 lg:hidden">
            <div className="flex items-center justify-between rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                  LineScout
                </p>
                <p className="text-sm font-semibold text-neutral-900">Agent App</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignOut(true)}
                className="btn btn-outline px-3 py-1 text-[11px] border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Sign out
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#F5F6FA] to-transparent" />
              <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#F5F6FA] to-transparent" />
              <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                {navItems.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-[70vh] rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-[rgba(45,52,97,0.12)] px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.2)] bg-white px-3 py-1 text-xs font-semibold text-[var(--agent-blue)] shadow-sm hover:border-[rgba(45,52,97,0.35)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                Agent app
              </span>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl lg:text-3xl">
                {title}
              </h1>
              {subtitle ? <p className="mt-2 text-sm text-neutral-600">{subtitle}</p> : null}
            </div>
            <div className="px-4 pb-6 sm:px-6 sm:pb-8">{children}</div>
          </div>
        </div>
      </div>

      {showSignOut ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close sign out modal"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setShowSignOut(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                LineScout
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Sign out?</h2>
              <p className="mt-2 text-sm text-neutral-600">
                You will need to sign in again to access your agent workspace.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[rgba(45,52,97,0.12)] bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowSignOut(false)}
                className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSignOut(false);
                  await signOut();
                }}
                className="btn btn-primary px-4 py-2 text-xs"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
