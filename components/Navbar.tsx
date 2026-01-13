"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import AboutModal from "@/components/AboutModal";

export default function Navbar() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change style behavior (basic: close on escape too)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <nav className="w-full border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <Image
              src="/linescout-logo.png"
              alt="LineScout Logo"
              width={120}
              height={28}
              className="h-auto w-auto"
              priority
            />
          </Link>

          {/* Desktop links (never wrap) */}
          <div className="hidden items-center gap-4 text-sm text-neutral-300 lg:flex">
            <Link href="/machine-sourcing" className="hover:text-white whitespace-nowrap">
              Machine Sourcing
            </Link>

            <Link href="/white-label" className="hover:text-white whitespace-nowrap">
              White Label
            </Link>

            <Link
              href="https://sureimports.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white whitespace-nowrap"
            >
              Sure Imports
            </Link>

            {/*
            <button
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 font-semibold text-neutral-200 hover:border-neutral-700"
              aria-label="About"
              type="button"
            >
              About
            </button>
            */}
          </div>

          {/* Mobile actions: hamburger + about */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>

            <button
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 font-semibold text-neutral-200 hover:border-neutral-700"
              aria-label="About"
              type="button"
            >
              ?
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {menuOpen ? (
          <div className="lg:hidden border-t border-neutral-800 bg-neutral-950">
            <div className="mx-auto max-w-7xl px-4 py-3">
              <div className="grid gap-2 text-sm">
                <Link
                  href="/machine-sourcing"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-neutral-200 hover:border-neutral-700"
                >
                  Machine Sourcing
                </Link>

                <Link
                  href="/white-label"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-neutral-200 hover:border-neutral-700"
                >
                  White Label
                </Link>

                <a
                  href="https://sureimports.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-neutral-200 hover:border-neutral-700"
                >
                  Sure Imports
                </a>
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </nav>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}