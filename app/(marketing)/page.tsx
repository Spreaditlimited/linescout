"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, BadgeCheck, Clock } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_18%_10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(900px_circle_at_82%_18%,rgba(34,197,94,0.14),transparent_55%),radial-gradient(900px_circle_at_60%_92%,rgba(168,85,247,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-neutral-950/70" />
      </div>

      <div className="relative">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-y-10 md:grid-cols-2 md:gap-10 md:items-start">
            {/* Left */}
            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
                <ShieldCheck className="h-4 w-4" />
                Machine sourcing clarity, then verified execution
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                Helping you get the machine you need from China with zero mistakes
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
                Think through the exact machine or production line you need on LineScout, then have our machine sourcing
                experts get you the machine from verified manufacturers in China.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/machine-sourcing"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Start Chatting <ArrowRight className="h-4 w-4" />
                </Link>

                <a
                  href="https://wa.me/message/CUR7YKW3K3RBA1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Ask a quick question
                </a>
              </div>

              <div className="mt-10 hidden sm:grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TrustPill
                  icon={<BadgeCheck className="h-4 w-4" />}
                  title="Clarity first"
                  desc="Specs and production reality before you make any payment."
                />
                <TrustPill
                  icon={<Clock className="h-4 w-4" />}
                  title="Fast direction"
                  desc="Get grounded guidance in minutes."
                />
                <TrustPill
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Verified execution"
                  desc="Token unlocks human sourcing and verification."
                />
              </div>
            </div>

            {/* Right */}
            <div className="rounded-3xl bg-white/6 p-6 ring-1 ring-white/10 backdrop-blur-xl overflow-hidden">
              <div className="rounded-2xl bg-neutral-950/40 p-5 ring-1 ring-white/10">
                <p className="text-xs font-semibold text-white/60">Before you start</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Who this is for</h2>

                <ul className="mt-4 space-y-3 text-sm text-white/70">
                  <Bullet>You want to import a machine or full production line from China and avoid costly mistakes.</Bullet>
                  <Bullet>You need help choosing capacity, specs, power rating, and what to verify before payment.</Bullet>
                  <Bullet>You want verified manufacturers, clean documentation, and a structured execution process.</Bullet>
                </ul>

                <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs font-semibold text-white/60">How it works</p>
                  <p className="mt-2 text-[13.5px] leading-snug text-white/60">
                    Start with free guidance. When you want verified suppliers, exact quotes, and factory-level execution
                    support, you activate a sourcing token and we hand you to humans.
                  </p>
                </div>

                <Link
                  href="/machine-sourcing"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Chat with LineScout <ArrowRight className="h-4 w-4" />
                </Link>

                <p className="mt-3 text-center text-xs text-white/55">
                  Start free. Pay only when you want verified execution.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* STEPS */}
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard
              step="01"
              title="Describe what you want"
              desc="Tell LineScout your product, capacity, location, and power situation. You get clarity on the right machine specs."
            />
            <InfoCard
              step="02"
              title="Get grounded guidance"
              desc="We help you avoid common sourcing mistakes and give cost and landing ranges shaped by Nigeria realities."
            />
            <InfoCard
              step="03"
              title="Activate verified execution"
              desc="When you want supplier verification, exact quotes, negotiation, and coordination, you activate a token and we proceed properly."
            />
          </div>
        </section>

        {/* TESTIMONIALS (LAST BLOCK) */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="flex flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
              <BadgeCheck className="h-4 w-4" />
              4.8 / 5 Google rating • 90+ reviews
            </div>

            <h2 className="text-xl font-semibold tracking-tight text-white">Trusted by real founders</h2>

            <p className="max-w-2xl text-sm leading-relaxed text-white/70">
              These are real experiences from Nigerian and international business owners who have worked with us on
              sourcing, factory coordination, and delivery from China.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Testimonial
              quote="If you want to source anything in China and sleep with both eyes closed, this is the person. Someone who listens, executes every agreement, understands the terrain, and has a real team on ground in China. You can pay him ₦100 million and go to sleep. Kobo no go miss."
              name="Chioma Ifeanyi-Eze"
              meta="Founder, AccountingHub & Fresh Eggs Market • Nigeria"
            />

            <Testimonial
              quote="After multiple difficult machine imports from China, we needed this next machine to land perfectly. Sure Imports handled everything with precision. The machine arrived early, the power rating matched Nigeria’s setup, installation was seamless, and production started immediately. Today, our capacity has increased by 3.5x and output quality is better than expected."
              name="Roberta Edu"
              meta="Founder & CEO, Moppet Foods"
/>

            <Testimonial
              quote="From order placement to delivery, everything was handled with professionalism and precision. The shipment arrived on time and in perfect condition. You can tell this is a team that genuinely cares about execution and customer experience."
              name="Amarachi Ndukauba Ogbuagu"
              meta="Business Owner • Canada"
            />
          </div>

          <Link
            href="/machine-sourcing"
            className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 md:w-auto"
          >
            Start Chatting <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}

function TrustPill({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-white/85">{icon}</span>
        <span className="text-white">{title}</span>
      </div>
      <p className="mt-1 text-sm text-white/70">{desc}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 rounded-full bg-white/60" />
      <span>{children}</span>
    </li>
  );
}

function InfoCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
      <p className="text-xs font-semibold text-white/60">Step {step}</p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}

function Testimonial({ quote, name, meta }: { quote: string; name: string; meta: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur">
      <p className="text-sm leading-relaxed text-white/70">“{quote}”</p>
      <div className="mt-4">
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/55">{meta}</p>
      </div>
    </div>
  );
}