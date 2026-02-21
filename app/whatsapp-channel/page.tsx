import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, ShieldCheck, Users } from "lucide-react";

export default function WhatsAppChannelLandingPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-neutral-950 text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_18%_10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(900px_circle_at_82%_18%,rgba(34,197,94,0.14),transparent_55%),radial-gradient(900px_circle_at_60%_92%,rgba(168,85,247,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-neutral-950/75" />
      </div>

      <div className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-y-10 md:grid-cols-2 md:gap-10 md:items-start">
            {/* Left */}
            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
                <ShieldCheck className="h-4 w-4" />
                WhatsApp Channel: Machine Sourcing + White Labeling
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                Learn machine sourcing and white labeling from China, directly from me
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
                Short daily lessons, practical examples, and the real mistakes founders make when importing machines
                or white label products from China.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://whatsapp.com/channel/0029Vb7dxTwF1YlOfZqz3i2V"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Join WhatsApp Channel <ArrowRight className="h-4 w-4" />
                </a>

              </div>

              <div className="mt-10 hidden sm:grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TrustPill
                  icon={<Users className="h-4 w-4" />}
                  title="40,000+ users"
                  desc="Registered on Sure Imports."
                />
                <TrustPill
                  icon={<BadgeCheck className="h-4 w-4" />}
                  title="4.8 / 5 rating"
                  desc="90+ Google reviews."
                />
                <TrustPill
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Market-aware"
                  desc="Power, ports, and execution."
                />
              </div>
            </div>

            {/* Right */}
            <div className="rounded-3xl bg-white/6 p-6 ring-1 ring-white/10 backdrop-blur-xl overflow-hidden">
              <div className="rounded-2xl bg-neutral-950/40 p-5 ring-1 ring-white/10">
                <p className="text-xs font-semibold text-white/60">About the teacher</p>

                <div className="mt-4 flex items-start gap-4">
                  <div className="shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
                    <Image
                      src="/tochukwu.jpg"
                      alt="Tochukwu Nkwocha"
                      width={88}
                      height={88}
                      className="h-[88px] w-[88px] object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white">Tochukwu Nkwocha</p>
                    <p className="mt-1 text-sm text-white/70">
                      Founder and CEO, Sure Importers Limited
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  Since 2018, we have helped hundreds of businesses to safely source products from China. Now, you can
                  learn directly from me.
                </p>

                <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-sm font-semibold text-white/85">What you’ll get in the channel</p>
                  <ul className="mt-3 space-y-2 text-sm text-white/70">
                    <li className="flex gap-3">
                      <span className="mt-2 h-2 w-2 rounded-full bg-white/60" />
                      How to spec machines so factories don’t ship the wrong thing
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-2 w-2 rounded-full bg-white/60" />
                      Power and voltage realities in your market, and how they destroy installs
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-2 w-2 rounded-full bg-white/60" />
                      White labeling playbook: sampling, MOQ, packaging, and quality control
                    </li>
                  </ul>
                </div>

                <a
                  href="https://whatsapp.com/channel/0029Vb7dxTwF1YlOfZqz3i2V"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                >
                  Join WhatsApp Channel <ArrowRight className="h-4 w-4" />
                </a>

                <p className="mt-3 text-center text-xs text-white/55">
                  Free to join. No spam. Just practical sourcing lessons.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials (same 3 as machine sourcing page) */}
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur md:p-8">
            <div className="flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
                <BadgeCheck className="h-4 w-4" />
                4.8 / 5 Google rating • 90+ reviews
              </div>

              <h2 className="text-xl font-semibold tracking-tight text-white">
                Trusted by real founders
              </h2>

              <p className="max-w-2xl text-sm leading-relaxed text-white/70">
                A few words from founders who have worked with us on sourcing, verification, and delivery from China.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Testimonial
                quote="If you want to source anything in China and sleep with both eyes closed, this is the person. Someone who listens, executes every agreement, understands the terrain, and has a real team on ground in China. You can pay him ₦100 million and go to sleep. Kobo no go miss."
                name="Chioma Ifeanyi-Eze"
                meta="Founder, AccountingHub & Fresh Eggs Market • Nigeria"
              />

              <Testimonial
                quote="We needed 2,000 custom-branded items and only provided a description and reference image. What we got back matched exactly what we envisioned. What stood out most was integrity. Pricing was transparent and even came in lower than expected."
                name="Chukwuedozie Nwokoye"
                meta="Business Owner • Nigeria"
              />

              <Testimonial
                quote="From order placement to delivery, everything was handled with professionalism and precision. The shipment arrived on time and in perfect condition. You can tell this is a team that genuinely cares about execution and customer experience."
                name="Amarachi Ndukauba Ogbuagu"
                meta="Business Owner • Canada"
              />
            </div>

            <a
              href="https://whatsapp.com/channel/0029Vb7dxTwF1YlOfZqz3i2V"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 md:w-auto"
            >
              Join the WhatsApp Channel <ArrowRight className="h-4 w-4" />
            </a>
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

function Testimonial({ quote, name, meta }: { quote: string; name: string; meta: string }) {
  return (
    <div className="rounded-3xl bg-neutral-950/40 p-6 ring-1 ring-white/10">
      <p className="text-sm leading-relaxed text-white/75">“{quote}”</p>
      <div className="mt-4">
        <p className="text-sm font-semibold text-white/90">{name}</p>
        <p className="text-xs text-white/55">{meta}</p>
      </div>
    </div>
  );
}
