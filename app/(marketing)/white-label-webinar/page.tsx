import type { Metadata } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import MarketingTopNav from "@/components/MarketingTopNav";

export const metadata: Metadata = {
  title: "White Label Webinar | LineScout",
  description:
    "Watch the free white-label webinar and learn how to start your own brand with products from China.",
};

const VIDEO_EMBED_URL = "https://www.youtube.com/embed/ms-yhEExIRg";

export default function WhiteLabelWebinarPage() {
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
        <div className="absolute -top-48 right-[-200px] h-[520px] w-[520px] rounded-full bg-[rgba(45,52,97,0.18)] blur-3xl" />
        <div className="absolute -bottom-48 left-[-180px] h-[420px] w-[420px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
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

      <main className="relative flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pb-0 pt-10 sm:px-6 md:pt-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
            <Sparkles className="h-4 w-4" />
            White‑Label Webinar
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Watch the training now
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-700 sm:text-base">
            This 35-minute session walks you through product selection, sourcing, branding, and
            launching in Nigeria. Presented by Tochukwu Nkwocha.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--agent-blue)]">
            Trusted by 40,000+ entrepreneurs
          </p>

          <div className="mt-8 overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
            <div className="aspect-video w-full bg-neutral-100">
              <iframe
                title="White label webinar"
                src={VIDEO_EMBED_URL}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">Ready to take the next step?</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Explore curated white‑label ideas or join the WhatsApp channel for updates and support.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="https://linescout.sureimports.com/white-label"
                className="btn btn-primary px-4 py-2 text-xs"
              >
                Explore white‑label ideas
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="https://whatsapp.com/channel/0029Vb7dxTwF1YlOfZqz3i2V"
                className="btn btn-outline px-4 py-2 text-xs border-[rgba(45,52,97,0.2)] text-[var(--agent-blue)]"
              >
                Join WhatsApp channel
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
