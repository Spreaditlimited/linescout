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

export default function HomePage() {
  return (
    <MarketingFrame>
      <div className="relative flex min-h-screen flex-col bg-[#F7F6F2] text-neutral-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-[-140px] h-[420px] w-[420px] rounded-full bg-emerald-200/45 blur-3xl" />
          <div className="absolute -bottom-40 left-[-120px] h-[360px] w-[360px] rounded-full bg-emerald-100/60 blur-3xl" />
        </div>

        <main className="relative flex-1">
        <header className="z-40 border-b border-emerald-100 bg-[#F7F6F2]/95 shadow-sm backdrop-blur md:sticky md:top-0">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
              <Image src="/linescout-logo.png" alt="LineScout" width={130} height={36} priority />
            </div>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-700 md:flex">
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
                className="rounded-full border border-neutral-300 bg-white px-3 py-2 text-[11px] font-semibold text-neutral-900 shadow-sm hover:border-emerald-300 sm:px-4 sm:py-2 sm:text-xs"
              >
                Continue on web
              </Link>
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 pb-12 pt-12 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:pt-24 md:pb-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 sm:text-xs">
              <Sparkles className="h-4 w-4" />
              LineScout is better on the app
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Source smarter from China with Nigeria-first guidance.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              LineScout helps you think through specs, quotes, and shipping before you commit to a supplier. When you are
              ready, our specialists take over and execute with verified manufacturers.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link
                href="#app-download"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-[11px] font-semibold text-white shadow-lg shadow-emerald-200/70 hover:bg-emerald-700 sm:px-6 sm:py-3 sm:text-sm"
              >
                Get the app <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-[11px] font-semibold text-neutral-900 hover:border-emerald-300 sm:px-6 sm:py-3 sm:text-sm"
              >
                Start on the web
              </Link>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-neutral-600 sm:hidden">
              <Link
                href="#features"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1"
              >
                Features
              </Link>
              <Link
                href="#how"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1"
              >
                How it works
              </Link>
              <Link
                href="#agents"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1"
              >
                Agents
              </Link>
            </div>

            <div className="mt-5">
              <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:px-0">
                <Stat label="8+ years" desc="China sourcing experience" />
                <Stat label="40k+" desc="Registered customers" />
                <Stat label="4.7/5" desc="Google rating" />
              </div>
            </div>
          </div>

          <div className="relative mt-6 md:mt-0">
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
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-600 sm:text-xs">
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Secure payments</span>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Verified specialists</span>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Quote tracking</span>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 md:pb-14">
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
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
              <h2 className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">Everything you need to source confidently.</h2>
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

        <section id="how" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 md:pb-14">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">How LineScout works</h2>
              <p className="mt-2 text-sm text-neutral-600">
                A simple flow that protects you from costly sourcing mistakes.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Verified suppliers + escrowed execution
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3 md:gap-4">
            {steps.map((step) => (
              <StepCard key={step.step} {...step} />
            ))}
          </div>
        </section>

        <section id="agents" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 md:pb-16">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">Built for agents in China</h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                  Claim projects, update milestones, build quotes, and stay aligned with the LineScout admin team.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-neutral-600">
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">Project claiming</span>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">Quote builder</span>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">Payout tracking</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  href="#app-download"
                  className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 hover:bg-emerald-700 sm:w-auto"
                >
                  Download Agent App
                </Link>
                <Link
                  href="/agents"
                  className="inline-flex w-full items-center justify-center rounded-full border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 hover:border-emerald-300 sm:w-auto"
                >
                  View agent agreement
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="app-download" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 md:pb-20">
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 sm:p-8 md:p-10">
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
                  LineScout is better on the app.
                </h3>
                <p className="mt-3 text-sm text-neutral-700">
                  Get real-time updates, faster chat, and richer project management on the mobile app.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="#"
                  className="inline-flex w-full items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white sm:w-auto"
                >
                  App Store
                </a>
                <a
                  href="#"
                  className="inline-flex w-full items-center justify-center rounded-full border border-neutral-900 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 sm:w-auto"
                >
                  Google Play
                </a>
              </div>
            </div>
          </div>
        </section>

        </main>
        <div className="mt-auto">
          <Footer />
        </div>
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
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-50 p-2 text-emerald-700">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      <p className="mt-2 text-xs text-neutral-600 sm:text-sm">{desc}</p>
    </div>
  );
}

function StepCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-[11px] font-semibold text-emerald-700 sm:text-xs">Step {step}</p>
      <h3 className="mt-1.5 text-sm font-semibold text-neutral-900 sm:text-base">{title}</h3>
      <p className="mt-2 text-xs text-neutral-600 sm:text-sm">{desc}</p>
    </div>
  );
}

function Stat({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] shadow-sm sm:min-w-0 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
      <p className="text-xs font-semibold text-neutral-900 sm:text-base">{label}</p>
      <p className="text-[10px] text-neutral-600 sm:text-xs">{desc}</p>
    </div>
  );
}
