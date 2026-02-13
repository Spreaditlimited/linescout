"use client";

import { useState } from "react";
import Link from "next/link";

type NavItem = { href: string; label: string };

export default function MarketingTopNavMenu({
  navItems,
  disabledNavLabel,
  buttonBorderClassName,
  buttonTextClassName,
  menuBorderClassName,
  menuBgClassName,
  menuTextClassName,
  menuHoverClassName,
  disabledNavClassName,
}: {
  navItems: NavItem[];
  disabledNavLabel: string;
  buttonBorderClassName: string;
  buttonTextClassName: string;
  menuBorderClassName: string;
  menuBgClassName: string;
  menuTextClassName: string;
  menuHoverClassName: string;
  disabledNavClassName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
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
      {menuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className={`absolute right-4 top-full z-40 mt-2 w-48 overflow-hidden rounded-2xl border text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.18)] lg:hidden ${menuBorderClassName} ${menuBgClassName} ${menuTextClassName}`}
          >
            <div className="flex flex-col gap-3 px-4 py-3">
              {navItems.map((item) =>
                item.label === disabledNavLabel ? (
                  <span key={item.href} className={`cursor-default ${disabledNavClassName}`}>
                    {item.label}
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={menuHoverClassName}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
