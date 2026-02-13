"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "linescout_cookie_notice_ack";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] w-[min(980px,calc(100%-24px))] -translate-x-1/2">
      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.2)] backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-sm text-neutral-700">
          <p className="font-semibold text-neutral-900">We use cookies</p>
          <p>
            LineScout uses cookies and similar tools to run the site, understand usage, and improve your
            experience.
          </p>
          <a
            href="https://www.sureimports.com/privacy-policy"
            className="text-xs font-semibold text-[var(--agent-blue,#2D3461)] underline"
            target="_blank"
            rel="noreferrer"
          >
            Learn more
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={acknowledge}
            className="rounded-2xl bg-[var(--agent-blue,#2D3461)] px-5 py-2 text-xs font-semibold text-white"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
