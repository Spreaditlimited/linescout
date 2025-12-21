"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type MeResponse =
  | {
      ok: true;
      user: {
        username: string;
        role: "admin" | "agent";
        permissions: {
          can_view_leads: boolean;
          can_view_handoffs: boolean;
        };
      };
    }
  | { ok: false; error: string };

export default function InternalTopBar() {
  const pathname = usePathname();
  const hide = pathname === "/internal/sign-in";

  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/internal/auth/me", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (alive) setMe(data);
      } catch {
        if (alive) setMe({ ok: false, error: "Failed to load session" });
      }
    }

    // Even if we are hiding, keep hook order stable.
    // We can skip fetching on sign-in page.
    if (!hide) load();

    return () => {
      alive = false;
    };
  }, [hide]);

  const authed = useMemo(() => !!(me && "ok" in me && me.ok), [me]);
  const user = authed ? (me as any).user : null;

  async function signOut() {
    await fetch("/api/internal/auth/sign-out", { method: "POST" });
    window.location.href = "/internal/sign-in";
  }

  // Now it's safe to return based on hide / auth state
  if (hide) return null;
  if (!authed || !user) return null;

  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Image
          src="/lineScout-logo.png"
          alt="LineScout"
          width={140}
          height={36}
          priority
        />
        <div className="hidden sm:block">
          <div className="text-sm font-semibold text-neutral-100">Internal Dashboard</div>
          <div className="text-xs text-neutral-400">Signed in as {user.username}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-2">
          {user.role === "admin" ? (
            <Link
              href="/internal/leads"
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm hover:border-neutral-700"
            >
              Leads
            </Link>
          ) : null}

          {user.permissions.can_view_handoffs ? (
            <Link
              href="/internal/agent-handoffs"
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm hover:border-neutral-700"
            >
              Handoffs
            </Link>
          ) : null}

          {user.role === "admin" ? (
            <Link
              href="/internal/settings"
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm hover:border-neutral-700"
            >
              Settings
            </Link>
          ) : null}
        </nav>

        <button
          onClick={signOut}
          className="ml-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}