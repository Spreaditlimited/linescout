import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Ship, Factory, Handshake, ArrowRight } from "lucide-react";
import MarketingTopNav from "@/components/MarketingTopNav";
import InlineEmailOtpForm from "@/components/marketing/InlineEmailOtpForm";

export const metadata: Metadata = {
  title: "Import from China Without the Guesswork | LineScout",
  description:
    "Source machines, start your brand, and buy in bulk with trusted sourcing specialists in China.",
};

const steps = [
  {
    title: "Source machines that fit your operations",
    desc: "We help you define specs clearly and shortlist manufacturers that can actually deliver.",
    icon: Factory,
  },
  {
    title: "Start your brand with confidence",
    desc: "Explore over 1,000 product ideas. From product discovery to sourcing from manufacturers in China, we handle everything.",
    icon: BadgeCheck,
  },
  {
    title: "Buy in bulk and ship with clarity",
    desc: "We support supplier negotiation, purchasing, and shipping so there are no costly surprises.",
    icon: Ship,
  },
];

export default function ImportFromChinaPage() {
  const brandBlue = "#2D3461";

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col bg-[#F5F6FA] text-neutral-900 antialiased"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <style>{`
        html,
        body {
          background: #F5F6FA !important;
        }
      `}</style>
      <MarketingTopNav
        backgroundClassName="bg-white/80 backdrop-blur-md"
        borderClassName="border-b border-neutral-200/50"
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

      <main className="relative flex-1">
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-12 px-6 pb-20 pt-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16 md:pt-24">
          
          {/* Left Column: Value Prop */}
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(45,52,97,0.15)] bg-white px-3 py-1.5 shadow-sm">
              <Handshake className="h-3.5 w-3.5 text-[var(--agent-blue)]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--agent-blue)]">
                Expert Sourcing Support
              </span>
            </div>
            
            <h1 className="mt-6 text-4xl font-bold leading-[1.15] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              Import from China <br />
              <span className="text-[var(--agent-blue)]">Without the Guesswork</span>
            </h1>
            
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-600">
              Source machines, build your brand, and buy products in bulk. We connect you to
              trusted specialists on the ground in China who help you find the right manufacturer,
              negotiate prices, handle purchasing, and coordinate shipping to your destination.
            </p>

            <div id="signup-form" className="mt-10 max-w-md scroll-mt-24">
              <div className="rounded-2xl bg-white p-2 shadow-xl shadow-neutral-200/50 border border-neutral-100">
                <InlineEmailOtpForm />
              </div>
              <p className="ml-2 mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-1 w-1 rounded-full bg-neutral-400"></span>
                We will send a code to the email address you provide
              </p>
            </div>
          </div>

          {/* Right Column: Feature Card */}
          <div className="relative">
            <div className="rounded-[32px] border border-white bg-white/70 p-8 shadow-[0_32px_64px_-16px_rgba(45,52,97,0.15)] backdrop-blur-xl sm:p-10">
              <div className="mb-8">
                <h2 className="text-xl font-bold text-neutral-900">
                  End-to-end support
                </h2>
                <div className="mt-2 h-1 w-12 rounded-full bg-[var(--agent-blue)]"></div>
              </div>

              <div className="relative space-y-10">
                {/* Vertical Line Connector */}
                <div className="absolute left-[17px] top-2 h-[calc(100%-20px)] w-[1px] bg-neutral-200" />

                {steps.map((item, idx) => (
                  <div key={idx} className="relative flex items-start gap-5">
                    <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-sm">
                      <item.icon className="h-4 w-4 text-[var(--agent-blue)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="#signup-form"
                className="mt-10 inline-flex w-full items-center justify-between rounded-2xl bg-[var(--agent-blue)] p-4 text-white md:hidden"
              >
                <span className="text-xs font-medium">Ready to see our process?</span>
                <ArrowRight className="h-4 w-4 opacity-70" />
              </Link>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
