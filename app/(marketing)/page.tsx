"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { useState } from "react";
import Footer from "@/components/Footer";
import MarketingFrame from "@/components/MarketingFrame";

const features = [
  {
    title: "Nigeria-first sourcing clarity",
    desc: "Get guidance that reflects real costs, timelines, and risks for Nigerian buyers.",
    icon: ShieldCheck,
  },
  {
    title: "Specialists when you are ready",
    desc: "Move from AI clarity to verified human sourcing the moment you want execution.",
    icon: MessageCircle,
  },
  {
    title: "Quotes you can trust",
    desc: "Clear totals, shipping options, and structured payment milestones.",
    icon: BadgeCheck,
  },
  {
    title: "Track every project",
    desc: "Follow sourcing progress from manufacturer discovery to delivery.",
    icon: Truck,
  },
];

const steps = [
  {
    step: "01",
    title: "Think it through",
    desc: "Start with LineScout chat and clarify specs, budget, and feasibility.",
  },
  {
    step: "02",
    title: "Activate specialists",
    desc: "Pay a commitment fee to unlock verified sourcing and execution.",
  },
  {
    step: "03",
    title: "Track delivery",
    desc: "Monitor milestones, quotes, and payments in one place.",
  },
];

const stats = [
  { label: "8+ years", desc: "China sourcing experience" },
  { label: "40k+", desc: "Registered customers" },
  { label: "4.7/5", desc: "Google rating" },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <MarketingFrame>
      <div className="relative flex min-h-screen flex-col bg-[#F7F6F2] text-neutral-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-[-160px] h-[520px] w-[520px] rounded-full bg-emerald-200/45 blur-3xl" />
          <div className="absolute -bottom-48 left-[-160px] h-[420px] w-[420px] rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="absolute bottom-[10%] right-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-100/60 blur-3xl" />
        </div>

        <header className="z-40 border-b border-emerald-100 bg-[#F7F6F2]/95 backdrop-blur md:sticky md:top-0">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Image src="/linescout-logo.png" alt="LineScout" width={130} height={36} priority />
              <span className="hidden h-7 w-px rounded-full bg-emerald-200 sm:inline-block" />
              <div className="hidden sm:block">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
                  Nigeria-first sourcing
                </p>
                <p className="text-xs text-neutral-500">AI clarity + specialist execution</p>
              </div>
            </div>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-700 lg:flex">
              <Link href="#features" className="hover:text-emerald-700">
                Features
              </Link>
              <Link href="#how" className="hover:text-emerald-700">
                How it works
              </Link>
              <Link href="#agents" className="hover:text-emerald-700">
                For agents
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className="hidden rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-900 shadow-sm hover:border-emerald-300 lg:inline-flex"
              >
                Continue on web
              </Link>
              <button
                type="button"
                aria-label="Toggle menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-white text-emerald-900 shadow-sm lg:hidden"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="text-lg font-semibold">≡</span>
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div className="border-t border-emerald-100 bg-white/90 px-4 py-3 text-sm font-semibold text-neutral-700 lg:hidden">
              <div className="flex flex-col gap-3">
                <Link href="#features" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  Features
                </Link>
                <Link href="#how" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  How it works
                </Link>
                <Link href="#agents" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  For agents
                </Link>
                <Link href="/sign-in" className="hover:text-emerald-700" onClick={() => setMenuOpen(false)}>
                  Continue on web
                </Link>
              </div>
            </div>
          ) : null}
        </header>

        <main className="relative flex-1">
          <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-12 pt-10 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:pt-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 sm:text-xs">
                <Sparkles className="h-4 w-4" />
                LineScout is better on the app
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Source smarter from China with Nigeria-first guidance.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-700 sm:text-base">
                LineScout helps you think through specs, quotes, and shipping before you commit to a supplier. When you
                are ready, our specialists take over and execute with verified manufacturers.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="#app-download"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 hover:bg-emerald-700"
                >
                  Get the app <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:border-emerald-300"
                >
                  Start on the web
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-600 sm:text-xs">
                <Link href="#features" className="rounded-full border border-neutral-200 bg-white px-3 py-1">
                  Features
                </Link>
                <Link href="#how" className="rounded-full border border-neutral-200 bg-white px-3 py-1">
                  How it works
                </Link>
                <Link href="#agents" className="rounded-full border border-neutral-200 bg-white px-3 py-1">
                  Agents
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <Stat key={s.label} label={s.label} desc={s.desc} />
                ))}
              </div>
            </div>

            <div className="relative mt-4 md:mt-0">
              <div className="hero-orb hero-orb--a -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-200/50 sm:-right-8 sm:-top-8 sm:h-28 sm:w-28" />
              <div className="hero-orb hero-orb--b -left-8 top-10 h-20 w-20 rounded-full bg-sky-200/50 sm:h-24 sm:w-24" />
              <div className="hero-orb hero-orb--a bottom-4 right-6 h-16 w-16 rounded-full bg-amber-200/50 sm:h-20 sm:w-20" />
              <div className="hero-float rounded-[26px] border border-neutral-200 bg-white p-2.5 shadow-2xl sm:rounded-[32px] sm:p-4">
                <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-2 sm:rounded-[28px] sm:p-3">
                  <Image
                    src="/hero.png"
                    alt="LineScout dashboard preview"
                    width={520}
                    height={980}
                    className="h-auto w-full rounded-[16px] sm:rounded-[22px]"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-600 sm:text-xs">
                <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Secure payments</span>
                <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Verified specialists</span>
                <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Quote tracking</span>
              </div>
            </div>
          </section>

          <section id="features" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="grid gap-4 md:grid-cols-2 md:gap-6">
              <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-8">
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                  <Image
                    src="/everything.png"
                    alt="Everything you need to source confidently"
                    width={960}
                    height={540}
                    className="h-auto w-full"
                  />
                </div>
                <h2 className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
                  Everything you need to source confidently.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                  From clarity to execution, LineScout keeps the process structured, transparent, and Nigeria-ready.
                </p>
                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 sm:text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  App-first experience with web access when you need it.
                </div>
              </div>
              <div className="grid gap-4">
                {features.map((feature) => (
                  <FeatureCard key={feature.title} {...feature} />
                ))}
              </div>
            </div>
          </section>

          <section id="how" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="rounded-[32px] border border-emerald-100 bg-white px-6 py-8 shadow-sm sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">How it works</p>
                  <h2 className="mt-3 text-2xl font-semibold">A clear path from idea to delivery</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    Every step is built to minimize risk and keep decisions grounded in real data.
                  </p>
                </div>
                <Link
                  href="/machine"
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900"
                >
                  Open LineScout <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {steps.map((s) => (
                  <StepCard key={s.step} {...s} />
                ))}
              </div>
            </div>
          </section>

          <section id="app-download" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <div className="rounded-[28px] border border-emerald-100 bg-emerald-600 px-6 py-8 text-white shadow-[0_25px_60px_rgba(16,185,129,0.35)] sm:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Mobile first</p>
                <h2 className="mt-3 text-2xl font-semibold">LineScout is best on the app</h2>
                <p className="mt-2 text-sm text-emerald-100">
                  Get instant access to AI clarity, sourcing specialists, and project tracking from your phone.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white">
                    Download on iOS
                  </button>
                  <button className="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white">
                    Get it on Android
                  </button>
                </div>
              </div>

              <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">Why it matters</p>
                <h3 className="mt-3 text-xl font-semibold">Make better sourcing decisions earlier</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Evaluate suppliers, shipping routes, and cost assumptions before you commit capital. The app keeps
                  context, notes, and actions in one place.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Benefit label="Instant AI clarity" />
                  <Benefit label="Verified human specialists" />
                  <Benefit label="Secure commitment payments" />
                  <Benefit label="Real-time project milestones" />
                </div>
              </div>
            </div>
          </section>

          <section id="agents" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
            <div className="rounded-[32px] border border-neutral-200 bg-white px-6 py-8 shadow-sm sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">For agents</p>
                  <h2 className="mt-3 text-2xl font-semibold">Built for agents in China</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    Manage paid chats, milestones, and payouts with the LineScout Agent app.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/agent-app"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Download Agent App <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/agents"
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900"
                  >
                    View agent agreement
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </MarketingFrame>
  );
}

function FeatureCard({
  title,
  desc,
  icon: Icon,
}: {
  title: string;
  desc: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
    </div>
  );
}

function StepCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
      <p className="text-xs font-semibold text-emerald-600">Step {step}</p>
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600">{desc}</p>
    </div>
  );
}

function Stat({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm">
      <p className="text-lg font-semibold text-neutral-900">{label}</p>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </div>
  );
}

function Benefit({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs font-semibold text-neutral-700">
      {label}
    </div>
  );
}
