"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type NavItem = { href: string; label: string };

const navItems: NavItem[] = [
  { href: "#features", label: "Features" },
  { href: "#app-download", label: "Get the app" },
  { href: "/white-label", label: "White Label" },
  { href: "/agent-app", label: "For agents" },
];

const disabledNavLabel = "Get the app";

export default function MarketingTopNav({
  backgroundClassName = "bg-[#F7F6F2]/95",
  borderClassName = "border-emerald-100",
  dividerClassName = "bg-emerald-200",
  accentClassName = "text-emerald-700",
  navTextClassName = "text-neutral-700",
  navHoverClassName = "hover:text-emerald-700",
  buttonBorderClassName = "border-emerald-100",
  buttonTextClassName = "text-emerald-900",
  menuBorderClassName = "border-emerald-100",
  menuBgClassName = "bg-white/90",
  menuTextClassName = "text-neutral-700",
  menuHoverClassName = "hover:text-emerald-700",
  disabledNavClassName = "text-neutral-400",
}: {
  backgroundClassName?: string;
  borderClassName?: string;
  dividerClassName?: string;
  accentClassName?: string;
  navTextClassName?: string;
  navHoverClassName?: string;
  buttonBorderClassName?: string;
  buttonTextClassName?: string;
  menuBorderClassName?: string;
  menuBgClassName?: string;
  menuTextClassName?: string;
  menuHoverClassName?: string;
  disabledNavClassName?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={`z-40 border-b ${borderClassName} ${backgroundClassName} backdrop-blur`}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="LineScout home">
            <Image src="/linescout-logo.png" alt="LineScout" width={130} height={36} priority />
          </Link>
          <span className={`hidden h-7 w-px rounded-full sm:inline-block ${dividerClassName}`} />
          <div className="hidden sm:block">
            <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${accentClassName}`}>
              Nigeria-first sourcing
            </p>
            <p className="text-xs text-neutral-500">AI clarity + specialist execution</p>
          </div>
        </div>
        <nav className={`hidden items-center gap-6 text-sm font-semibold lg:flex ${navTextClassName}`}>
          {navItems.map((item) =>
            item.label === disabledNavLabel ? (
              <span key={item.href} className={`cursor-default ${disabledNavClassName}`}>
                {item.label}
              </span>
            ) : (
              <Link key={item.href} href={item.href} className={navHoverClassName}>
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle menu"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-sm lg:hidden ${buttonBorderClassName} ${buttonTextClassName}`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="text-lg font-semibold">≡</span>
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div className={`border-t px-4 py-3 text-sm font-semibold lg:hidden ${menuBorderClassName} ${menuBgClassName} ${menuTextClassName}`}>
          <div className="flex flex-col gap-3">
            {navItems.map((item) =>
              item.label === disabledNavLabel ? (
                <span key={item.href} className={`cursor-default ${disabledNavClassName}`}>
                  {item.label}
                </span>
              ) : (
                <Link key={item.href} href={item.href} className={menuHoverClassName}>
                  {item.label}
                </Link>
              )
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
