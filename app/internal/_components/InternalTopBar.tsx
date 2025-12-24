"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

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

type NavItem = { label: string; href: string };

export default function InternalTopBar() {
  const pathname = usePathname();
  const hide = pathname === "/internal/sign-in";

  const [me, setMe] = useState<MeResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

    if (!hide) load();

    return () => {
      alive = false;
    };
  }, [hide]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ESC closes menu
  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const authed = useMemo(() => !!(me && "ok" in me && me.ok), [me]);
  const user = authed ? (me as any).user : null;

  const isAdmin = user?.role === "admin";
  const canLeads = !!(isAdmin || user?.permissions?.can_view_leads);
  const canHandoffs = !!(isAdmin || user?.permissions?.can_view_handoffs);

  async function signOut() {
    await fetch("/api/internal/auth/sign-out", { method: "POST" });
    window.location.href = "/internal/sign-in";
  }

  function isActive(href: string) {
    return pathname === href;
  }

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [];

    // Leads: admin OR permission
    if (canLeads) {
      items.push({ label: "Leads", href: "/internal/leads" });
    }

    // Handoffs: admin OR permission
    if (canHandoffs) {
      items.push({
        label: "Sourcing Projects",
        href: "/internal/agent-handoffs",
      });
    }

    // Settings: admin-only
    if (isAdmin) {
      items.push({ label: "Settings", href: "/internal/settings" });
    }

    return items;
  }, [canLeads, canHandoffs, isAdmin]);

  if (hide) return null;
  if (!authed || !user) return null;

  const linkBase = "rounded-xl border px-4 py-2 text-sm transition-colors";
  const linkIdle =
    "border-neutral-800 bg-neutral-900/60 text-neutral-200 hover:border-neutral-700";
  const linkActive = "border-neutral-600 bg-neutral-100 text-neutral-950";

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <img src="/linescout-logo.png" alt="LineScout" className="h-[22px] w-auto" />

          <div className="hidden sm:block min-w-0">
            <div className="text-sm font-semibold text-neutral-100">Internal Dashboard</div>
            <div className="text-xs text-neutral-400 truncate">Signed in as {user.username}</div>
          </div>

          <div className="sm:hidden min-w-0">
            <div className="text-sm font-semibold text-neutral-100 truncate">{user.username}</div>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-2">
          <nav className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${linkBase} ${isActive(item.href) ? linkActive : linkIdle}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={signOut}
            className="ml-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Sign out
          </button>
        </div>

        {/* Mobile hamburger */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile menu via portal (always overlays search field) */}
      {mounted && menuOpen
        ? createPortal(
            <div className="fixed inset-0 z-[9999]">
              {/* Backdrop */}
              <button
                type="button"
                className="absolute inset-0 bg-black/60"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />

              {/* Panel */}
              <div className="absolute right-3 top-3 w-[min(92vw,320px)] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
                <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                  <div className="text-sm font-semibold text-neutral-100">Menu</div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:border-neutral-700"
                  >
                    Close
                  </button>
                </div>

                <div className="p-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm ${
                        isActive(item.href)
                          ? "bg-neutral-100 text-neutral-950"
                          : "text-neutral-200 hover:bg-neutral-900/60"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}

                  <div className="my-2 h-px bg-neutral-800" />

                  <button
                    onClick={signOut}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-left text-sm text-neutral-200 hover:border-neutral-700"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}