import TrackLookupClient from "@/components/shipments/TrackLookupClient";

export const runtime = "nodejs";

export default function TrackPage() {
  const brandBlue = "#20459B";
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

      <main className="relative flex-1 pb-24">
        <TrackLookupClient />
      </main>
    </div>
  );
}
