"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
          can_view_analytics: boolean;
        };
      };
    }
  | { ok: false; error: string };

type NavItem = { label: string; href: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Dropdown({
  label,
  items,
  activeHref,
}: {
  label: string;
  items: NavItem[];
  activeHref: string;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => setMounted(true), []);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Recompute position when opened (and on resize/scroll)
  useEffect(() => {
    if (!open) return;

    const compute = () => {
      const el = btnRef.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const desiredWidth = Math.max(260, Math.round(r.width));
      const margin = 12;

      const vw = window.innerWidth;
      const left = clamp(r.left, margin, vw - desiredWidth - margin);

      setPos({
        top: Math.round(r.bottom + 10),
        left: Math.round(left),
        width: desiredWidth,
      });
    };

    compute();

    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);

    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  const btnBase =
    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap";
  const btnIdle =
    "border-neutral-800 bg-neutral-900/60 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900";
  const btnActive = "border-neutral-600 bg-neutral-100 text-neutral-950";

  const anyActive = items.some((i) => i.href === activeHref);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${btnBase} ${anyActive ? btnActive : btnIdle}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span className="text-xs opacity-80">▼</span>
      </button>

      {mounted && open && pos
        ? createPortal(
            <div className="fixed inset-0 z-[99999]">
              {/* Click outside */}
              <button
                type="button"
                className="absolute inset-0 bg-black/55"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />

              <div
                className="absolute overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
                style={{
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                }}
              >
                <div className="border-b border-neutral-800 px-4 py-3">
                  <div className="text-xs font-semibold tracking-widest text-neutral-400 uppercase">
                    {label}
                  </div>
                </div>

                <div className="p-2">
                  {items.map((item) => {
                    const active = item.href === activeHref;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-xl px-4 py-3 text-sm font-medium ${
                          active
                            ? "bg-neutral-100 text-neutral-950"
                            : "text-neutral-200 hover:bg-neutral-900"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const authed = !!(me && "ok" in me && me.ok);
  const user = authed ? (me as any).user : null;

  const isAdmin = user?.role === "admin";
  const canLeads = !!(isAdmin || user?.permissions?.can_view_leads);
  const canHandoffs = !!(isAdmin || user?.permissions?.can_view_handoffs);
  const canAnalytics = !!(isAdmin || user?.permissions?.can_view_analytics);

  async function signOut() {
    await fetch("/api/internal/auth/sign-out", { method: "POST" });
    window.location.href = "/internal/sign-in";
  }

  // Build groups WITHOUT hooks (so no hook-order issues)
  const operationsItems: NavItem[] = [];
  if (canLeads) operationsItems.push({ label: "Leads", href: "/internal/leads" });
  if (canHandoffs) {
    operationsItems.push({ label: "Sourcing Projects", href: "/internal/agent-handoffs" });
    operationsItems.push({ label: "Paid Chat", href: "/internal/paid-chat" });
  }
  if (canAnalytics) operationsItems.push({ label: "Analytics", href: "/internal/analytics" });

  const adminItems: NavItem[] = [];
  if (isAdmin) {
    adminItems.push({ label: "Agents", href: "/internal/agents" });
    adminItems.push({ label: "App Users", href: "/internal/admin/app-users" });
    adminItems.push({ label: "Agent Approval", href: "/internal/admin/agent-approval" });
    adminItems.push({ label: "Payout Requests", href: "/internal/admin/payouts" });
    adminItems.push({ label: "Settings", href: "/internal/settings" });
  }

  if (hide) return null;
  if (!authed || !user) return null;

  const linkBase =
    "rounded-xl border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap";
  const linkIdle =
    "border-neutral-800 bg-neutral-900/60 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900";

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/linescout-logo.png"
            alt="LineScout"
            className="h-[22px] w-auto flex-shrink-0"
          />

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
            {operationsItems.length > 0 ? (
              <Dropdown label="Operations" items={operationsItems} activeHref={pathname} />
            ) : null}

            {adminItems.length > 0 ? (
              <Dropdown label="Admin" items={adminItems} activeHref={pathname} />
            ) : null}
          </nav>

          <button onClick={signOut} className={`ml-2 ${linkBase} ${linkIdle}`}>
            Sign out
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mounted && menuOpen
        ? createPortal(
            <div className="fixed inset-0 z-[9999]">
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />

              <div className="absolute right-3 top-3 w-[min(94vw,360px)] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
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
                  {operationsItems.length > 0 ? (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                        Operations
                      </div>
                      {operationsItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block rounded-xl px-4 py-3 text-sm font-medium ${
                            pathname === item.href
                              ? "bg-neutral-100 text-neutral-950"
                              : "text-neutral-200 hover:bg-neutral-900/60"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                      <div className="my-2 h-px bg-neutral-800" />
                    </>
                  ) : null}

                  {adminItems.length > 0 ? (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold tracking-widest text-neutral-500 uppercase">
                        Admin
                      </div>
                      {adminItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block rounded-xl px-4 py-3 text-sm font-medium ${
                            pathname === item.href
                              ? "bg-neutral-100 text-neutral-950"
                              : "text-neutral-200 hover:bg-neutral-900/60"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                      <div className="my-2 h-px bg-neutral-800" />
                    </>
                  ) : null}

                  <button
                    onClick={signOut}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-left text-sm font-medium text-neutral-200 hover:border-neutral-700"
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