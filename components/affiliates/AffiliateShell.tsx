"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/affiliates/dashboard", label: "Dashboard" },
  { href: "/affiliates/referrals", label: "Referrals" },
  { href: "/affiliates/activity", label: "Activity" },
  { href: "/affiliates/payouts", label: "Payouts" },
  { href: "/affiliates/payout-history", label: "Payout history" },
];

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={false}
      className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-2.5 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
        active
          ? "bg-[var(--agent-blue)] text-white shadow-lg shadow-[rgba(45,52,97,0.25)]"
          : "text-neutral-700 hover:bg-[rgba(45,52,97,0.08)] hover:text-[var(--agent-blue)]"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AffiliateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/affiliates/me", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!active) return;
      if (!res.ok || !json?.ok) {
        router.replace("/affiliates/sign-in");
        return;
      }
      setMe(json.affiliate);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function signOut() {
    await fetch("/api/affiliates/auth/sign-out", { method: "POST" });
    router.replace("/affiliates/sign-in");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] text-neutral-900">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 shadow-sm">
              <img src="/icons/icon-192.png" alt="LineScout" className="h-10 w-10 animate-pulse" />
            </div>
            <div className="text-sm font-semibold text-neutral-900">Preparing affiliate dashboard</div>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--agent-blue)]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6FA] text-neutral-900" style={{ ["--agent-blue" as any]: "#2D3461" }}>
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 lg:py-8">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 self-start rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] lg:flex h-fit">
          <div className="px-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">LineScout</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">Affiliate Workspace</p>
          </div>
          <nav className="mt-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
          <div className="mt-auto px-2 pb-2">
            <button
              type="button"
              onClick={signOut}
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">LineScout</p>
                <p className="text-sm font-semibold text-neutral-900">Affiliate Workspace</p>
              </div>
              <button
                type="button"
                onClick={signOut}
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

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
