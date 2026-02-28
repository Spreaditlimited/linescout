import TrackLookupClient from "@/components/shipments/TrackLookupClient";
import Footer from "@/components/Footer";
import MarketingTopNav from "@/components/MarketingTopNav";

export const runtime = "nodejs";

export default function TrackPage() {
  const brandBlue = "#2D3461";
  return (
    <div
      className="relative flex min-h-screen flex-col bg-[#F5F6FA] text-neutral-900"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-160px] h-[520px] w-[520px] rounded-full bg-[rgba(45,52,97,0.18)] blur-3xl" />
        <div className="absolute -bottom-48 left-[-160px] h-[420px] w-[420px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
        <div className="absolute bottom-[15%] right-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-100/60 blur-3xl" />
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

      <main className="relative flex-1 pb-24">
        <TrackLookupClient />
      </main>
      <div className="mt-auto">
        <Footer variant="agent" />
      </div>
    </div>
  );
}
