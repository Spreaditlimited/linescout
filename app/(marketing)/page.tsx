import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import Footer from "@/components/Footer";
import MarketingTopNav from "@/components/MarketingTopNav";
import HomeHeroCta from "@/components/marketing/HomeHeroCta";
import HomeAppDownloadButtons from "@/components/marketing/HomeAppDownloadButtons";

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

const testimonials = [
  {
    name: "Chioma Ifeanyi-Eze",
    title: "Founder, Accountinghub & Fresh Eggs Market",
    location: "Nigeria",
    highlight:
      "Transparent, deeply knowledgeable, and trustworthy. I felt safe enough to sleep after paying a huge sum. The team listens closely and follows through with care.",
    initials: "CI",
  },
  {
    name: "Chukwuedozie Nwokoye",
    title: "Businessman",
    location: "Nigeria",
    highlight:
      "Delivered 2,000 custom-branded items with flawless quality and integrity. Pricing came in below expectation. The process was smooth from brief to delivery.",
    initials: "CN",
  },
  {
    name: "Amarachi Ndukauba Ogbuagu",
    title: "Businesswoman",
    location: "Canada",
    highlight:
      "Professional, timely delivery and excellent attention to detail. The entire process was smooth and reliable. Everything arrived in perfect condition.",
    initials: "AO",
  },
  {
    name: "Emmanuel Ayobami Adewumi",
    title: "Customer",
    location: "Nigeria",
    highlight:
      "Lightning-fast delivery, transparent refurbishment, and generous extras. Reliable service from start to finish. The customer support stayed responsive throughout.",
    initials: "EA",
  },
  {
    name: "Agu Mba",
    title: "Customer",
    location: "United Kingdom",
    highlight:
      "Timely arrival and impressive quality for event souvenirs. Cost-effective sourcing without stress. The gifts impressed everyone at the celebration. I would gladly use them again.",
    initials: "AM",
  },
  {
    name: "Okoli, Augustine J. FCIA",
    title: "Head of HR & Admin, Microware Solutions Limited",
    location: "Nigeria",
    highlight:
      "Securely packaged, on-time delivery with quality that exceeded expectations. Professional communication throughout. Everything performed flawlessly.",
    initials: "OA",
  },
  {
    name: "Roberta Edu",
    title: "Founder, Moppet Foods",
    location: "Nigeria",
    highlight:
      "Equipment arrived early, matched power specs, and installed without drama. Output quality exceeded expectations and production capacity jumped by 3.5x.",
    long:
      "We had been burned by two previous China imports, so I needed this expansion to land perfectly. Sure Imports delivered early with the correct power rating, and the installation finished without a single issue. The machine now runs beautifully, and our capacity is up by 3.5x. The quote even came in lower than expected, and the team kept us confident at every step. I recommend them to anyone who needs China sourcing without the headache.",
    initials: "RE",
  },
  {
    name: "Boma Sydney",
    title: "Customer",
    location: "Nigeria",
    highlight:
      "I was afraid of losing my money, but I received my goods and never looked back. Fast service, quick support, and real integrity. I now recommend them with confidence.",
    initials: "BS",
  },
];

export default function HomePage() {
  const brandBlue = "#2D3461";
  return (
    <div
      className="relative flex min-h-screen flex-col bg-[#F5F6FA] text-neutral-900"
      style={{ ["--agent-blue" as any]: brandBlue }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-160px] h-[520px] w-[520px] rounded-full bg-[rgba(45,52,97,0.18)] blur-3xl" />
        <div className="absolute -bottom-48 left-[-160px] h-[420px] w-[420px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
        <div className="absolute bottom-[10%] right-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-sky-100/60 blur-3xl" />
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
          <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-12 pt-10 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:pt-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
                <Sparkles className="h-4 w-4" />
                Smart China product sourcing
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Source smarter from China with Nigeria-first guidance.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-700 sm:text-base">
                LineScout helps you think through specs, quotes, and shipping before you commit to a supplier. When you
                are ready, our specialists take over and execute with verified manufacturers.
              </p>

              <HomeHeroCta />

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
              <div className="hero-float rounded-[26px] border border-neutral-200 bg-white p-2.5 shadow-[0_25px_60px_rgba(15,23,42,0.12)] sm:rounded-[32px] sm:p-4">
                <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-2 sm:rounded-[28px] sm:p-3">
                  <Image
                    src="/hero.png"
                    alt="LineScout dashboard preview"
                    width={520}
                    height={980}
                    className="h-auto w-full rounded-[16px] sm:rounded-[22px]"
                    priority
                    sizes="(min-width: 1024px) 520px, (min-width: 768px) 45vw, 90vw"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-600 sm:text-xs">
                <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Secure payments</span>
                <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Verified specialists</span>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="rounded-[28px] border border-[rgba(45,52,97,0.12)] bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--agent-blue)]">
                    Testimonials
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-neutral-900 sm:text-3xl">
                    Trusted by founders, operators, and growth teams.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-neutral-600">
                    Real stories from business owners who source from China with Sure Imports and LineScout.
                  </p>
                </div>
                <div className="rounded-2xl border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-4 py-2 text-xs font-semibold text-[var(--agent-blue)]">
                  90+ verified reviews
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[24px] border border-[rgba(45,52,97,0.12)] bg-[rgba(45,52,97,0.04)] p-5 shadow-sm lg:row-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--agent-blue)]">
                    Featured review
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                    {testimonials[6].long || testimonials[6].highlight}
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-[var(--agent-blue)] shadow-sm">
                      {testimonials[6].initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{testimonials[6].name}</p>
                      <p className="text-xs text-neutral-600">
                        {testimonials[6].title} · {testimonials[6].location}
                      </p>
                    </div>
                  </div>
                </div>

                {testimonials.filter((_, idx) => idx !== 6).map((t) => (
                  <div
                    key={t.name}
                    className="flex h-full flex-col rounded-[22px] border border-neutral-200 bg-white p-5 shadow-sm"
                  >
                    <p className="text-sm text-neutral-700">{t.highlight}</p>
                    <div className="mt-auto flex items-center gap-3 pt-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(45,52,97,0.08)] text-xs font-semibold text-[var(--agent-blue)]">
                        {t.initials}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">{t.name}</p>
                        <p className="text-[11px] text-neutral-600">
                          {t.title} · {t.location}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
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

          <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                  White label ideas
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-neutral-900">
                  Find market-ready products you can brand and sell.
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Explore curated white label product ideas, compare pricing signals, and start sourcing with
                  verified partners when you are ready.
                </p>
                <Link
                  href="/white-label"
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
                >
                  Explore white label ideas <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="rounded-[28px] border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.06)] p-6 text-sm text-neutral-700 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                  Built for Nigeria
                </p>
                <p className="mt-3 text-sm text-neutral-600">
                  Save time by starting with products that already have demand signals and a clear path to
                  sourcing. We help you move from idea to supplier fast.
                </p>
              </div>
            </div>
          </section>

          <section id="app-download" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
            <div className="rounded-[28px] border border-[rgba(45,52,97,0.2)] bg-[var(--agent-blue)] px-6 py-8 text-white shadow-[0_25px_60px_rgba(45,52,97,0.35)] sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[rgba(255,255,255,0.7)]">Mobile first</p>
                  <h2 className="mt-3 text-2xl font-semibold">LineScout is best on the app</h2>
                  <p className="mt-2 text-sm text-[rgba(255,255,255,0.75)]">
                    Get instant access to AI clarity, sourcing specialists, and project tracking from your phone.
                  </p>
                </div>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white"
                >
                  Continue on web <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <HomeAppDownloadButtons />
            </div>
          </section>

          
      </main>

      <Footer variant="agent" />
    </div>
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
    <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(45,52,97,0.08)] text-[var(--agent-blue)]">
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
