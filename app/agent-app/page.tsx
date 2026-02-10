"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Bolt, Briefcase, ShieldCheck, Smartphone } from "lucide-react";
import Footer from "@/components/Footer";
import ComingSoonModal from "@/components/ComingSoonModal";
import MarketingTopNav from "@/components/MarketingTopNav";

const highlights = [
  {
    title: "Paid chat inbox",
    desc: "Claim projects, respond fast, and keep context organized across active handoffs.",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    title: "Project control",
    desc: "Update milestones, attach files, and keep clients aligned with factory timelines.",
    icon: <Bolt className="h-5 w-5" />,
  },
  {
    title: "Points-based rewards",
    desc: "Earn points for fast execution and response times, converted to NGN rewards.",
    icon: <BadgeCheck className="h-5 w-5" />,
  },
  {
    title: "Secure earnings",
    desc: "Commission tracking, payout requests, and verified withdrawals in one place.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

const steps = [
  {
    step: "01",
    title: "Claim a paid handoff",
    desc: "Jump into a verified request the moment payment is completed.",
  },
  {
    step: "02",
    title: "Run the sourcing workflow",
    desc: "Coordinate suppliers, samples, and timelines inside the agent workspace.",
  },
  {
    step: "03",
    title: "Deliver and earn",
    desc: "Complete milestones fast, earn reward points, and withdraw commissions.",
  },
];

export default function AgentAppLandingPage() {
  const brandBlue = "#2D3461";
  const [showAppModal, setShowAppModal] = useState(false);
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-white text-neutral-900 font-sans"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-180px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.22),transparent_65%)]" />
        <div className="absolute right-[-120px] top-[140px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.16),transparent_65%)]" />
        <div className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(45,52,97,0.18),transparent_70%)]" />
      </div>

      <div className="relative">
        <MarketingTopNav
          backgroundClassName="bg-white/95"
          borderClassName="border-transparent"
          dividerClassName="bg-[rgba(45,52,97,0.2)]"
          accentClassName="text-[var(--agent-blue)]"
          navTextClassName="text-neutral-600"
          navHoverClassName="hover:text-[var(--agent-blue)]"
          buttonBorderClassName="border-[rgba(45,52,97,0.2)]"
          buttonTextClassName="text-[var(--agent-blue)]"
          menuBorderClassName="border-[rgba(45,52,97,0.12)]"
          menuBgClassName="bg-white/95"
          menuTextClassName="text-neutral-700"
          menuHoverClassName="hover:text-[var(--agent-blue)]"
          disabledNavClassName="text-neutral-400"
        />

        <section
          id="features"
          className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16"
        >
          <div className="lg:pt-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.15)] bg-[rgba(45,52,97,0.06)] px-4 py-1 text-xs font-semibold text-[var(--agent-blue)]">
              <BadgeCheck className="h-4 w-4" />
              Built for approved LineScout agents
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
              Operate like a premium sourcing desk in China.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-600">
              The LineScout Agent app keeps every paid project moving. Claim chats, manage milestones, and
              withdraw earnings without leaving your workflow. Built for speed, accuracy, and trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/agent-app/sign-in"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
              >
                Open agent web app <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setShowAppModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
              >
                Download mobile app <Smartphone className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {highlights.map((h) => (
                <div
                  key={h.title}
                  className="h-full rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--agent-blue)] text-white">
                    {h.icon}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-neutral-900">{h.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600">{h.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[rgba(45,52,97,0.14)] bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.12)] lg:mt-2">
            <div className="rounded-3xl bg-[var(--agent-blue)] p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[rgba(255,255,255,0.7)]">Agent app</p>
              <h2 className="mt-2 text-2xl font-semibold">Your desk in your pocket</h2>
              <p className="mt-3 text-sm text-[rgba(255,255,255,0.75)]">
                Work from the factory floor, manage chats on the move, and keep projects compliant in real time.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowAppModal(true)}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold text-white"
                >
                  Download on iOS
                </button>
                <button
                  type="button"
                  onClick={() => setShowAppModal(true)}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold text-white"
                >
                  Get it on Android
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.06)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">Security</p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">Verified agents only</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Every agent undergoes approval and ongoing performance checks. Your work stays protected and
                compliant with LineScout policy.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">Workflow</p>
              <h2 className="mt-3 text-2xl font-semibold text-neutral-900">How the agent flow works</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Every step is designed for speed and accountability, from first contact to payout.
              </p>
              <div className="mt-6 space-y-4">
                {steps.map((s) => (
                  <div key={s.step} className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.06)] p-4">
                    <p className="text-xs font-semibold text-[var(--agent-blue)]">Step {s.step}</p>
                    <p className="mt-2 text-sm font-semibold text-neutral-900">{s.title}</p>
                    <p className="mt-1 text-xs text-neutral-600">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              id="app-download"
              className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">Mobile first</p>
              <h2 className="mt-3 text-2xl font-semibold text-neutral-900">Claim jobs faster on the mobile app</h2>
              <p className="mt-2 text-sm text-neutral-600">
                The mobile app is the fastest way to claim projects, reply to customers, and update statuses while
                you’re on-site. Keep it installed and notifications enabled.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Live chat alerts</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Respond within minutes and keep response time metrics strong.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Project handoff details</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Specs, budgets, and requirements are ready the moment you claim a chat.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Milestone updates</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Keep clients informed with structured updates and ETA changes.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Instant payouts</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Submit withdrawal requests in seconds once earnings are available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">Rewards</p>
              <h2 className="mt-3 text-2xl font-semibold text-neutral-900">Points that convert to NGN rewards</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Earn points based on speed between payment, shipping, and delivery, plus response time on paid chats.
                Points are converted to NGN at a configurable rate, and appear in your payouts summary.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[rgba(45,52,97,0.16)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Speed milestones</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Complete key transitions quickly to unlock higher point tiers.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.16)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Fast responses</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Reply promptly in paid chats to keep your response score strong.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.16)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">Transparent value</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Points convert to NGN using an admin‑set value shown in the app.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.16)] bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">In your payouts</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Track total points and rewards alongside commission earnings.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="rounded-3xl border border-[rgba(45,52,97,0.16)] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--agent-blue)]">
                  Earn more
                </p>
                <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                  The faster you execute, the more you earn
                </h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Points reward precision and speed. They’re designed to recognize agents who keep projects moving and
                  customers confident.
                </p>
                <div className="mt-4 rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.06)] p-4">
                  <p className="text-xs font-semibold text-[var(--agent-blue)]">Admin configurable</p>
                  <p className="mt-2 text-xs text-neutral-600">
                    LineScout can adjust thresholds and NGN value per point as we scale the agent program.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-[32px] border border-[rgba(45,52,97,0.2)] bg-[var(--agent-blue)] px-8 py-10 text-white shadow-[0_25px_60px_rgba(45,52,97,0.35)] md:px-12">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[rgba(255,255,255,0.7)]">Get started</p>
                <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
                  Ready to operate as a LineScout agent?
                </h2>
                <p className="mt-2 text-sm text-[rgba(255,255,255,0.8)]">
                  Sign in to the agent web app or download the mobile app to begin.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/agent-app/sign-in"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
                >
                  Sign in to web <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setShowAppModal(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-6 py-3 text-sm font-semibold text-white"
                >
                  Download mobile app
                </button>
              </div>
            </div>
          </div>
        </section>

        <Footer variant="agent" />
        <ComingSoonModal
          open={showAppModal}
          title="LineScout Agent Mobile App"
          message="The agent mobile app is almost ready. Keep using the web app and we will notify you the moment downloads go live."
          onClose={() => setShowAppModal(false)}
        />
      </div>
    </main>
  );
}
