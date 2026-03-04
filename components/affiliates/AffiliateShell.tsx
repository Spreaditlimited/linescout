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
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/affiliates/dashboard" className="text-sm font-semibold text-[var(--agent-blue)]">
            LineScout Affiliates
          </Link>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="hidden sm:inline">{me?.email}</span>
            <button
              onClick={signOut}
              className="rounded-2xl border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-600 hover:border-neutral-300"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--agent-blue)] text-white"
                    : "text-neutral-600 hover:bg-[rgba(45,52,97,0.08)] hover:text-[var(--agent-blue)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
