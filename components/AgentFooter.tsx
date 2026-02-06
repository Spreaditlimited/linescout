"use client";

import Link from "next/link";

export default function AgentFooter() {
  return (
    <footer className="flex-shrink-0 border-t border-[rgba(45,52,97,0.4)] bg-[#0F142B]">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[rgba(255,255,255,0.7)]">
              LineScout
            </p>
            <p className="text-sm leading-relaxed text-[rgba(255,255,255,0.7)]">
              The premium workspace for LineScout agents. Claim paid chats, manage projects, and request payouts with
              confidence.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[rgba(255,255,255,0.6)]">
              Agent resources
            </p>
            <div className="grid gap-2 text-sm text-[rgba(255,255,255,0.7)]">
              <Link href="/agent-app" className="hover:text-white">
                Agent web app
              </Link>
              <Link href="/agents" className="hover:text-white">
                Agent agreement
              </Link>
              <Link href="#agent-app" className="hover:text-white">
                Download mobile app
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[rgba(255,255,255,0.6)]">
              Support
            </p>
            <div className="grid gap-2 text-sm text-[rgba(255,255,255,0.7)]">
              <Link href="/internal/agent-support" className="hover:text-white">
                Agent support
              </Link>
              <a href="mailto:hello@sureimports.com" className="hover:text-white">
                hello@sureimports.com
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[rgba(255,255,255,0.08)]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-[rgba(255,255,255,0.55)]">
          <p>© {new Date().getFullYear()} LineScout. All rights reserved.</p>
          <p>Built for trusted sourcing agents in China.</p>
        </div>
      </div>
    </footer>
  );
}
