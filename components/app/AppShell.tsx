"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import { LayoutDashboard, FolderKanban, FileText, CreditCard, Wallet, MessageSquare, Bot, User } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/machine", label: "AI Chat", icon: Bot },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User },
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
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200/60"
          : "text-neutral-700 hover:bg-emerald-50 hover:text-emerald-700"
      }`}
    >
      <Icon
        className={`h-4 w-4 ${
          active ? "text-white" : "text-neutral-500 group-hover:text-emerald-600"
        }`}
      />
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [showSignOut, setShowSignOut] = useState(false);

  const signOut = async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    router.replace("/sign-in");
  };

  useEffect(() => {
    let active = true;
    async function checkAuth() {
      const res = await authFetch("/api/auth/me");
      if (!res.ok) {
        router.replace("/sign-in");
        return;
      }
      if (active) setChecking(false);
    }
    checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-neutral-900">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 lg:py-8">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm lg:flex">
          <div className="px-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">LineScout</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">User App</p>
          </div>
          <nav className="mt-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
          <div className="mt-auto px-2 pb-2">
            <button
              type="button"
              onClick={async () => {
                setShowSignOut(true);
              }}
              className="btn btn-outline w-full px-4 py-2 text-xs"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-4 space-y-3 lg:hidden">
            <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">LineScout</p>
                <p className="text-sm font-semibold text-neutral-900">User App</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignOut(true)}
                className="btn btn-outline px-3 py-1 text-[11px]"
              >
                Sign out
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#F7F6F2] to-transparent" />
              <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#F7F6F2] to-transparent" />
              <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
                {navItems.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-[70vh] rounded-3xl border border-neutral-200 bg-white shadow-sm">
            {checking ? (
              <div className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 w-1/3 rounded-full bg-neutral-100" />
                  <div className="h-24 w-full rounded-3xl bg-neutral-100" />
                  <div className="h-24 w-full rounded-3xl bg-neutral-100" />
                </div>
              </div>
            ) : (
              children
            )}
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
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                LineScout
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Sign out?</h2>
              <p className="mt-2 text-sm text-neutral-600">
                You will need to sign in again to access your projects and chats.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowSignOut(false)}
                className="btn btn-outline px-4 py-2 text-xs"
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
