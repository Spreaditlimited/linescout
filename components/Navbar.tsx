"use client";

import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
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
        <div className="flex items-center space-x-6 text-sm text-neutral-300">
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
        </div>
      </div>
    </nav>
  );
}