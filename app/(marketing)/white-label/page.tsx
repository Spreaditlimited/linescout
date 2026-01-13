import Link from "next/link";
import { ArrowRight, ShieldCheck, BadgeCheck, Clock } from "lucide-react";


export default function ProjectActivationPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-clip">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_18%_10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(900px_circle_at_82%_18%,rgba(34,197,94,0.14),transparent_55%),radial-gradient(900px_circle_at_60%_92%,rgba(168,85,247,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-neutral-950/70" />
      </div>

      <div className="relative">
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-start">
            {/* Left */}
            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
                <ShieldCheck className="h-4 w-4" />
                Automated Consultation for White Label founders
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                  Build your brand with the world’s best manufacturers
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
                  Every project is handled by verified, high-end manufacturers in China to guarantee quality. 
                  We match your specs to your target price, making sure your brand is profitable from day one.
                </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/white-label/wizard"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Start Your Project <ArrowRight className="h-4 w-4" />
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
                <TrustPill icon={<BadgeCheck className="h-4 w-4" />} title="Verified process" desc="Specs first, sourcing second." />
                <TrustPill icon={<Clock className="h-4 w-4" />} title="Fast kickoff" desc="Instant brief after payment." />
                <TrustPill icon={<ShieldCheck className="h-4 w-4" />} title="Deposit, not fee" desc="Credited to your order." />
              </div>
            </div>

            {/* Right */}
            <div className="rounded-3xl bg-white/6 p-6 ring-1 ring-white/10 backdrop-blur-xl">
              <div className="rounded-2xl bg-neutral-950/40 p-5 ring-1 ring-white/10">
                <p className="text-xs font-semibold text-white/60">Before you start</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Who this is for</h2>

                <ul className="mt-4 space-y-3 text-sm text-white/70">
                  <Bullet>You want to launch or scale a White Label product under your own brand.</Bullet>
                  <Bullet>You can share a reference product link or describe the exact product clearly.</Bullet>
                  <Bullet>You are ready for MOQs, branding decisions, and factory production timelines.</Bullet>
                </ul>

                <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-xs font-semibold text-white/60">Project Activation Deposit</p>
                        <p className="mt-1 text-3xl font-semibold">₦100,000</p>
                        <p className="mt-1 text-sm text-white/60">
                          This deposit activates a dedicated White Label sourcing workflow and is fully
                          credited to your first production order.
                        </p>
                    </div>

                    <div className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                      Refundable
                    </div>
                  </div>
                </div>

                <Link
                  href="/white-label/wizard"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Link>

                <p className="mt-3 text-center text-xs text-white/55">
                  You will review your Project File before any payment.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
         <div className="hidden md:grid gap-4 md:grid-cols-3">
            <InfoCard
                step="01"
                title="Build a factory-ready brief"
                desc="One question per screen. You’ll define product details, reference links, branding depth, and quantities."
              />
              <InfoCard
                step="02"
                title="Review your Project File"
                desc="You’ll see a clean summary of your brief before payment, so there’s no ambiguity."
              />
              <InfoCard
                step="03"
                title="Activate sourcing and handover"
                desc="After payment, your brief is routed to the right specialist so samples and production can start faster."
              />
          </div>
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
        <span>{title}</span>
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
      <h3 className="mt-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}