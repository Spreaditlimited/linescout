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
    </>
  );
}
