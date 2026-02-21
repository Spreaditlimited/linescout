import type { Metadata } from "next";
import { Sparkles, ShieldCheck, BadgeCheck } from "lucide-react";
import MarketingTopNav from "@/components/MarketingTopNav";
import MachineWebinarLeadForm from "@/components/marketing/MachineWebinarLeadForm";

export const metadata: Metadata = {
  title: "Machine Sourcing Webinar | LineScout",
  description:
    "Free training on how to source machines from China and launch profitable operations in your market.",
};

const highlights = [
  {
    title: "Pick the right machine",
    desc: "Learn how to evaluate demand, margins, and operational fit before you buy.",
    icon: Sparkles,
  },
  {
    title: "Source with confidence",
    desc: "Avoid common sourcing mistakes and learn how to vet suppliers the right way.",
    icon: ShieldCheck,
  },
  {
    title: "Launch with clarity",
    desc: "Pricing, setup, and validation steps that protect your capital.",
    icon: BadgeCheck,
  },
];

export default function MachineSourcingWebinarPage() {
  const brandBlue = "#2D3461";

  return (
    <div
      className="relative flex flex-col bg-[#F5F6FA] text-neutral-900"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <style>{`
        @media (max-width: 767px) {
          html,
          body {
            min-height: 0 !important;
            height: auto !important;
          }
          body {
            padding-bottom: 0 !important;
          }
          main {
            padding-bottom: 0 !important;
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-160px] h-[520px] w-[520px] rounded-full bg-[rgba(45,52,97,0.18)] blur-3xl" />
        <div className="absolute -bottom-48 left-[-160px] h-[420px] w-[420px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
        <div className="absolute bottom-[8%] right-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-100/60 blur-3xl" />
      </div>

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

      <main className="relative">
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 px-4 pb-0 pt-8 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:pt-20 md:pb-0">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
              <Sparkles className="h-4 w-4" />
              Free Machine Sourcing Webinar
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Sourcing Agro Processing Machines From China Without Losing Your Investment
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              From Idea to Installation: The Complete Strategy for Protecting Your Capital When
              Buying Machines From China
            </p>

            <div className="mt-4 hidden gap-2 sm:mt-8 sm:grid sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-4"
                >
                  <item.icon className="h-5 w-5 text-[var(--agent-blue)]" />
                  <p className="mt-2 text-sm font-semibold text-neutral-900">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-neutral-600 sm:text-xs">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white px-5 pb-2 pt-5 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:px-8 sm:pb-3 sm:pt-8 md:self-end">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              Reserve your spot
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-neutral-900">Get instant access</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Enter your name and email to receive the webinar link.
            </p>

            <div className="mt-4">
              <MachineWebinarLeadForm />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
