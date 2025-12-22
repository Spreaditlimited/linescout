"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import AboutModal from "@/components/AboutModal";

export default function Navbar() {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <nav className="w-full border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md">
        <div className="mx-auto flex items-center justify-between px-4 py-4 max-w-7xl">
          {/* Logo */}
          <Link href="/">
            <Image
              src="/linescout-logo.png"
              alt="LineScout Logo"
              width={120}
              height={28}
              className="h-auto w-auto cursor-pointer"
              priority
            />
          </Link>

          {/* Right-side Links */}
          <div className="flex items-center gap-4 text-sm text-neutral-300">
            <Link href="/machine-sourcing" className="hover:text-white">
              Machine Sourcing
            </Link>

            <Link href="/business-plan" className="hover:text-white">
              Business Plan
            </Link>

            <Link
              href="https://sureimports.com"
              target="_blank"
              className="hover:text-white"
            >
              Sure Imports
            </Link>

            {/* About trigger */}
            <button
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 font-semibold text-neutral-200 hover:border-neutral-700"
              aria-label="About Sure Importers Limited"
            >
              <span className="hidden sm:inline">About</span>
              <span className="inline sm:hidden">?</span>
            </button>
          </div>
        </div>
      </nav>

      {/* About modal */}
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}