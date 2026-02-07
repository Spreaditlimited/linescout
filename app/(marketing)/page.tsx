"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import Footer from "@/components/Footer";
import MarketingFrame from "@/components/MarketingFrame";
import MarketingTopNav from "@/components/MarketingTopNav";

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
];

const stats = [
  { label: "8+ years", desc: "China sourcing experience" },
  { label: "40,000+", desc: "Registered users trust Sure Imports" },
  { label: "4.8/5", desc: "Google rating from 90+ reviews" },
];

export default function HomePage() {
  return (
    <MarketingFrame>
      <div className="relative flex min-h-screen flex-col bg-[#F7F6F2] text-neutral-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-[-160px] h-[520px] w-[520px] rounded-full bg-emerald-200/45 blur-3xl" />
          <div className="absolute -bottom-48 left-[-160px] h-[420px] w-[420px] rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="absolute bottom-[10%] right-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-100/60 blur-3xl" />
        </div>

        <MarketingTopNav />

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
              </div>
            </div>
          </section>

          <section id="features" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </section>

          <section id="app-download" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-600 px-6 py-8 text-white shadow-[0_25px_60px_rgba(16,185,129,0.35)] sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Mobile first</p>
                  <h2 className="mt-3 text-2xl font-semibold">LineScout is best on the app</h2>
                  <p className="mt-2 text-sm text-emerald-100">
                    Get instant access to AI clarity, sourcing specialists, and project tracking from your phone.
                  </p>
                </div>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white"
                >
                  Continue on web <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white">
                  Download on iOS
                </button>
                <button className="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white">
                  Get it on Android
                </button>
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

function Stat({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm">
      <p className="text-lg font-semibold text-neutral-900">{label}</p>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </div>
  );
}
