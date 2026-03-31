import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Ship, Factory, Handshake, ArrowRight, Star, ChevronDown } from "lucide-react";
import MarketingTopNav from "@/components/MarketingTopNav";
import Footer from "@/components/Footer";
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

const reviews = [
  {
    initials: "RE",
    name: "Roberta Edu",
    role: "Founder, Moppet Foods · Nigeria",
    text: "We had been burned by two previous China imports, so I needed this expansion to land perfectly. Sure Imports delivered early with the correct power rating, and the installation finished without a single issue. The machine now runs beautifully, and our capacity is up by 3.5x. The quote even came in lower than expected, and the team kept us confident at every step. I recommend them to anyone who needs China sourcing without the headache.",
    featured: true,
  },
  {
    initials: "CI",
    name: "Chioma Ifeanyi-Eze",
    role: "Founder, Accountinghub & Fresh Eggs Market · Nigeria",
    text: "Transparent, deeply knowledgeable, and trustworthy. I felt safe enough to sleep after paying a huge sum. The team listens closely and follows through with care.",
  },
  {
    initials: "CN",
    name: "Chukwuedozie Nwokoye",
    role: "Businessman · Nigeria",
    text: "Delivered 2,000 custom-branded items with flawless quality and integrity. Pricing came in below expectation. The process was smooth from brief to delivery.",
  },
  {
    initials: "AO",
    name: "Amarachi Ndukauba Ogbuagu",
    role: "Businesswoman · Canada",
    text: "Professional, timely delivery and excellent attention to detail. The entire process was smooth and reliable. Everything arrived in perfect condition.",
  },
  {
    initials: "EA",
    name: "Emmanuel Ayobami Adewumi",
    role: "Customer · Nigeria",
    text: "Lightning-fast delivery, transparent refurbishment, and generous extras. Reliable service from start to finish. The customer support stayed responsive throughout.",
  },
  {
    initials: "AM",
    name: "Agu Mba",
    role: "Customer · United Kingdom",
    text: "Timely arrival and impressive quality for event souvenirs. Cost-effective sourcing without stress. The gifts impressed everyone at the celebration. I would gladly use them again.",
  },
  {
    initials: "OA",
    name: "Okoli, Augustine J. FCIA",
    role: "Head of HR & Admin, Microwave Solutions Limited · Nigeria",
    text: "Securely packaged, on-time delivery with quality that exceeded expectations. Professional communication throughout. Everything performed flawlessly.",
  },
  {
    initials: "BS",
    name: "Boma Sydney",
    role: "Customer · Nigeria",
    text: "I was afraid of losing my money, but I received my goods and never looked back. Fast service, quick support, and real integrity. I now recommend them with confidence.",
  },
];

const faqs = [
  {
    q: "What is LineScout?",
    a: "LineScout is a service from Sure Imports that helps you buy products from China with less risk and confusion.",
  },
  {
    q: "Who is it for?",
    a: "It is for business owners, online sellers, and anyone who wants to import products, machines, or branded goods from China.",
  },
  {
    q: "What can LineScout help me source?",
    a: "It can help with everyday products, white-label products (your own brand), and machines for production.",
  },
  {
    q: "Do I only chat with AI, or will I speak with people too?",
    a: "You can start with AI for quick guidance, then move to real sourcing specialists when you are ready to proceed.",
  },
  {
    q: "How do payments work?",
    a: "You receive a clear quote first, then pay in steps so you know what you are paying for at each stage.",
  },
  {
    q: "Can I pay through my LineScout wallet?",
    a: "Yes. If your wallet is active, you can use wallet funds toward eligible payments.",
  },
  {
    q: "Can LineScout handle shipping only?",
    a: "Yes. You can use it just for shipping and get a tracking number for your shipment.",
  },
  {
    q: "Can I track my shipment myself?",
    a: "Yes. You can enter your LineScout tracking number and see shipment updates.",
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
          scroll-behavior: smooth;
        }
        /* Hide default details marker */
        details > summary {
          list-style: none;
        }
        details > summary::-webkit-details-marker {
          display: none;
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
        {/* --- HERO SECTION --- */}
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

            {/* Added scroll-mt-32 so the fixed nav doesn't cover it on jump */}
            <div id="signup-form" className="mt-10 max-w-md scroll-mt-32">
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
                className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--agent-blue)] p-4 text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#22274A] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--agent-blue)] focus:ring-offset-2 md:hidden"
              >
                <span className="text-sm font-semibold">Ready to see our process?</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* --- REVIEWS SECTION --- */}
        <section className="mx-auto w-full max-w-7xl px-6 py-16 md:py-24">
          <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                Testimonials
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                Trusted by founders, operators, <br className="hidden sm:block" /> and growth teams.
              </h2>
              <p className="mt-3 text-base text-neutral-600">
                Real stories from business owners who source from China with Sure Imports and LineScout.
              </p>
            </div>
            <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-4 py-2 shadow-sm">
              <span className="text-sm font-semibold text-[var(--agent-blue)]">
                90+ verified reviews
              </span>
            </div>
          </div>

          <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
            {reviews.map((review, idx) => (
              <div
                key={idx}
                className={`mb-6 break-inside-avoid rounded-[28px] border bg-white p-8 shadow-sm transition-shadow hover:shadow-md ${
                  review.featured
                    ? "border-[rgba(45,52,97,0.15)] bg-neutral-50"
                    : "border-neutral-200/60"
                }`}
              >
                {review.featured && (
                  <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
                    Featured Review
                  </p>
                )}
                <div className="flex gap-1 text-[var(--agent-blue)]">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-5 text-sm leading-relaxed text-neutral-700">
                  {review.text}
                </p>
                <div className="mt-8 flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(45,52,97,0.08)] font-bold text-[var(--agent-blue)]">
                    {review.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{review.name}</p>
                    <p className="text-xs text-neutral-500">{review.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA AFTER REVIEWS */}
          <div className="mt-12 flex justify-center">
            <Link
              href="#signup-form"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#22274A] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--agent-blue)] focus:ring-offset-2"
            >
              Start sourcing safely
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* --- FAQ SECTION --- */}
        <section className="mx-auto w-full max-w-3xl px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <details
                key={idx}
                className="group rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-neutral-900">
                  {faq.q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-neutral-600 pr-8">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>

          {/* FINAL CTA AFTER FAQS */}
          <div className="mt-16 rounded-3xl bg-white p-8 text-center shadow-sm border border-neutral-200/60 sm:p-12">
            <h3 className="text-2xl font-bold text-neutral-900">
              Ready to import without the guesswork?
            </h3>
            <p className="mt-3 text-neutral-600">
              Sign up today to connect with trusted sourcing specialists and buy in bulk safely.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="#signup-form"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-8 py-4 text-base font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#22274A] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--agent-blue)] focus:ring-offset-2"
              >
                Get Started Now
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer variant="agent" />
    </div>
  );
}
