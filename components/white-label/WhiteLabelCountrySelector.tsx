"use client";

import Link from "next/link";
import { useState } from "react";
import SearchableSelect from "@/app/internal/_components/SearchableSelect";

type Option = { value: string; label: string };

function setCookie(value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `wl_country=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export default function WhiteLabelCountrySelector({
  value,
  className = "",
  options,
  locked = false,
  lockMessage,
  lockHref,
}: {
  value: string;
  className?: string;
  options: Option[];
  locked?: boolean;
  lockMessage?: string;
  lockHref?: string;
}) {
  const [notice, setNotice] = useState(false);
  return (
    <div className={className}>
      <SearchableSelect
        value={value}
        onChange={(next) => {
          if (locked) {
            if (next && next !== value) setNotice(true);
            return;
          }
          setCookie(next);
          window.location.reload();
        }}
        options={options}
        placeholder="Select country"
        variant="light"
      />
      <p className="mt-1 text-xs text-neutral-500">Pricing uses sea freight estimates.</p>
      {notice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            aria-label="Close notice"
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setNotice(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                    Marketplace locked
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                    Change country in profile
                  </h2>
                </div>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-600"
                  onClick={() => setNotice(false)}
                >
                  <span className="sr-only">Close</span>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-3 text-sm text-neutral-600">
                {lockMessage ||
                  "To see product prices in another market, change your country in your profile."}
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNotice(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-700"
                >
                  Close
                </button>
                {lockHref ? (
                  <Link
                    href={lockHref}
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--agent-blue)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Update country
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
