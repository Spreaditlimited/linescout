"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import { track } from "@/lib/metaPixel";

type Chip = { label: string; value: string };

type HowItem = {
  step: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
};

export default function HomePage() {
  const year = new Date().getFullYear();

  const promptChips: Chip[] = [
    {
      label: "Garri line estimate",
      value:
        "I want to set up a garri processing line in Nigeria. Capacity: 1 ton per day. Location: Ogun. Power available: generator. Give me the likely machines, estimated landing cost range in Lagos, and what to watch out for.",
    },
    {
      label: "Tomato paste line",
      value:
        "I want a small tomato paste production line. Target: 500 kg per hour. Packaging: sachet and tin. What machines do I need, what compliance should I plan for, and what landing cost range should I expect?",
    },
    {
      label: "Palm kernel oil",
      value:
        "I want to start palm kernel oil processing. Output: 1 ton per day. Explain the equipment list, power needs, expected losses, and the Nigeria realities that can affect timelines and cost.",
    },
    {
      label: "Rice mill setup",
      value:
        "I want a rice milling setup. Capacity: 2 to 3 tons per hour. I need guidance on machines, power, spares, and a realistic landing cost range to Lagos.",
    },
    {
      label: "Freeze dryer for fruit",
      value:
        "I want a freeze dryer for drying fruit and vegetables. 50kg per batch with power saving features.",
    },
    {
      label: "Organic fertilizer plant",
      value:
        "I want to set up an organic fertilizer plant in Imo state Nigeria. Which machines do I need and what is the estimate cost of the production line?",
    },
  ];

  const howItWorks: HowItem[] = [
    {
      step: "01",
      title: "Start with clarity",
      body:
        "Tell LineScout what you want to produce, your target capacity, where you will install, and your power situation.",
    },
    {
      step: "02",
      title: "Get grounded guidance",
      body:
        "You get equipment direction and landing cost ranges shaped by Nigeria realities. This is estimates not invoices.",
    },
    {
      step: "03",
      title: "Token unlocks execution support",
      body:
        "When you need verified suppliers, exact quotes, and factory level sourcing work, you purchase a sourcing token via Paystack.",
      cta: { href: "/machine-sourcing", label: "Start chatting" },
    },
    {
      step: "04",
      title: "WhatsApp handoff to Sure Imports",
      body:
        "After payment, we hand you over to humans for verification, negotiation, shipping, clearing guidance, and delivery coordination.",
      cta: { href: "/machine-sourcing", label: "Start chatting" },
    },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />

      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8">
        <Hero />
        <Divider />
        <HowItWorks items={howItWorks} />
        <Divider />
        <Products />
        <Divider />
        <NigeriaReality />
        <Divider />
        <ExamplePrompts chips={promptChips} />
        <Divider />
        <Trust />
        <WhatsAppFloat />
        <Footer year={year} />
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center" aria-label="LineScout home">
            <Image
              src="/linescout-logo.png"
              alt="LineScout"
              width={140}
              height={32}
              priority
              className="h-[26px] w-auto"
            />
          </Link>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="text-sm text-neutral-300">Your co-pilot for machine sourcing</div>
          <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-xs font-semibold tracking-wide text-neutral-200">
            BETA
          </span>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          <NavLink href="#how">How it works</NavLink>
          <NavLink href="#products">Modes</NavLink>
          <NavLink href="#prompts">Examples</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/machine-sourcing"
            className="hidden rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700 sm:inline-flex"
          >
            Business plan
          </Link>

          <Link
            href="/machine-sourcing"
            className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
          >
            Start chat
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="pt-10 sm:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Pill>Machines only. Nigeria aware.</Pill>

          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Clear guidance for machines and equipment sourcing from China to Nigeria
          </h1>

          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-300 sm:text-lg">
            LineScout helps Nigerian entrepreneurs, agro-processors, and manufacturers think through machine sourcing from
            China with real constraints in mind: power, compliance, shipping and clearing, and verification risks.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta href="/machine-sourcing" label="Start Sourcing Chat" />
            <SecondaryCta href="/machine-sourcing" label="Generate a Business Plan" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat title="Sourcing guidance" body="Equipment list and spec direction for your capacity and product." />
            <Stat title="Cost realism" body="Landing cost ranges that reflect Lagos port and clearing realities." />
            <Stat title="Execution gating" body="Token unlocks execution support and WhatsApp handoff." />
          </div>

          <p className="mt-6 text-sm text-neutral-400">
            No credit or debit card required to start a conversation with LineScout. Pay when you are ready.
          </p>
        </div>

        <div className="lg:col-span-5">
          <HeroPanel />
        </div>
      </div>
    </section>
  );
}

function HeroPanel() {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">Modes</div>
        <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-300">
          Focused workflows
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <ModeRow
          active
          title="Machine Sourcing Chat"
          body="Ask about production lines, capacity, suppliers and budgets. Get Nigeria-aware guidance."
          href="/machine-sourcing"
          action="Open"
        />
        <ModeRow
          title="Business Plan Writer"
          body="Use your paid token to generate a full plan for bank loans, grants, and internal use."
          href="/machine-sourcing"
          action="Open"
        />
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-sm font-semibold text-white">How tokens work</div>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          <li className="flex gap-2">
            <Dot />
            Sourcing tokens unlock machine sourcing help.
          </li>
          <li className="flex gap-2">
            <Dot />
            Business plan tokens generate a full DOCX business plan.
          </li>
          <li className="flex gap-2">
            <Dot />
            Each token is single use.
          </li>
        </ul>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            href="https://paystack.shop/pay/sourcing"
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
          >
            Sourcing Token
          </Link>
          <Link
            href="https://paystack.shop/pay/linescoutbusinessplan"
            className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
          >
            Business Plan Token
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Fast start</div>
        <div className="mt-2 text-sm font-semibold text-white">Tell LineScout these 4 things</div>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          <li className="flex gap-2">
            <Dot />
            Product and output capacity (per hour or per day)
          </li>
          <li className="flex gap-2">
            <Dot />
            Location and state (for logistics calculations)
          </li>
          <li className="flex gap-2">
            <Dot />
            Power situation (grid, generator, solar, hybrid)
          </li>
          <li className="flex gap-2">
            <Dot />
            Packaging plan (bulk, sachet, bottle, carton)
          </li>
        </ul>
      </div>
    </div>
  );
}

function HowItWorks({ items }: { items: HowItem[] }) {
  return (
    <section id="how" className="scroll-mt-24 py-10 sm:py-12">
      <SectionHeader title="How LineScout works" subtitle="A clean funnel from curiosity to execution support. No overpromising." />

      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.step} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-neutral-300">Step {it.step}</span>
              <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-300">
                Funnel
              </span>
            </div>
            <div className="mt-3 text-base font-semibold text-white">{it.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">{it.body}</p>
            {it.cta ? (
              <div className="mt-4">
                <Link href={it.cta.href} className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-200 hover:text-white">
                  {it.cta.label}
                  <ArrowRight />
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Products() {
  return (
    <section id="products" className="scroll-mt-24 py-10 sm:py-12">
      <SectionHeader title="Two core modes" subtitle="Machine sourcing clarity, plus a business plan you can use for a bank, grant, or internal review." />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ProductCard
          title="Machine Sourcing Assistant"
          eyebrow="Machine Sourcing Chat"
          whoFor={[
            "Agro-processors planning a new line",
            "Manufacturers expanding capacity",
            "Importers who need realistic specs and landing cost ranges",
          ]}
          youGet={[
            "Equipment list and spec direction for your capacity",
            "Power and operational realism for Nigeria",
            "Landing cost ranges and timeline risks",
          ]}
          microcopy="No supplier names. No exact prices. Clear direction."
          href="/machine-sourcing"
          cta="Start sourcing chat"
        />

        <ProductCard
          title="Business Plan Writer"
          eyebrow="Business Plan Writer"
          whoFor={[
            "Loan applications and bank documentation",
            "Grant applications and impact programs",
            "Internal planning and investor support",
          ]}
          youGet={[
            "A structured business plan for a production line setup",
            "Operations, market overview, staffing, risks, and assumptions",
            "A plan that supports realistic execution, not fantasy numbers",
          ]}
          microcopy="Generate and refine, then export for use."
          href="/machine-sourcing"
          cta="Generate a business plan"
        />
      </div>
    </section>
  );
}

function NigeriaReality() {
  const items = [
    {
      title: "Power realities",
      body: "We factor grid instability, generator sizing, and practical energy choices so your line does not fail on paper.",
    },
    {
      title: "Compliance and NAFDAC direction",
      body: "We flag likely compliance and documentation needs early so you do not get stuck after shipment.",
    },
    {
      title: "Shipping, clearing, and Lagos realities",
      body: "We keep expectations grounded on timelines, clearance steps, and the cost drivers that show up at landing.",
    },
    {
      title: "Factory verification risks",
      body: "We highlight where scams and misrepresentation happen, and what verification steps matter when you are ready.",
    },
  ] as const;

  return (
    <section className="py-10 sm:py-12">
      <SectionHeader title="Nigeria-aware by design" subtitle="LineScout is built around the parts that usually break sourcing plans." />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <IconBadge />
              <div>
                <div className="text-base font-semibold text-white">{it.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{it.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Ready to move from ranges to exact sourcing?</div>
            <div className="mt-1 text-sm text-neutral-300">
              Purchase a sourcing token when you need verified suppliers, exact quotes, and execution support.
            </div>
          </div>
          <Link
            href="https://paystack.shop/pay/sourcing"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
          >
            Token unlocks execution
          </Link>
        </div>
      </div>
    </section>
  );
}

function ExamplePrompts({ chips }: { chips: Chip[] }) {
  return (
    <section id="prompts" className="scroll-mt-24 py-10 sm:py-12">
      <SectionHeader title="Example prompts you can copy" subtitle="Click any prompt to copy. Paste into the Machine sourcing chat." />

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Prompt chips</div>
              <span className="text-xs text-neutral-400">Copy in one click</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <CopyChip key={c.label} label={c.label} value={c.value} />
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-white">Where to paste</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/machine-sourcing"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
                >
                  Paste in Sourcing Chat
                </Link>
                <Link
                  href="/machine-sourcing"
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
                >
                  Go to Business Plan Writer
                </Link>
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                Tip: Include your location, capacity, and power situation for sharper guidance.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <div className="text-sm font-semibold text-white">What to expect</div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">
              LineScout gives grounded direction and landing cost ranges. For actual machine sourcing, exact quotes, and
              factory verification, you will need a sourcing token and a WhatsApp handoff to our human team.
            </p>

            <div className="mt-4 space-y-3">
              <ExpectationRow title="Estimates not invoices" body="Rough ranges to help you plan and compare." />
              <ExpectationRow
                title="No supplier engagement until you’re ready to execute"
                body="We protect you from rushed decisions and misinformation."
              />
              <ExpectationRow title="Token unlocks execution support" body="Verification, negotiation, and coordination." />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    {
      title: "No supplier engagement by default",
      body: "Supplier engagement is part of execution, not curiosity. That is how we reduce confusion and reduce scams.",
    },
    {
      title: "No exact prices by default",
      body: "Machine pricing moves with specs, exchange rates, and factory conditions. We give ranges to help you plan.",
    },
    {
      title: "Token gates execution",
      body: "When you are ready for exact quotes and verification work, you purchase a Paystack token and we proceed properly.",
    },
    {
      title: "WhatsApp handoff is human",
      body: "Execution includes real conversations, documentation, and timelines. Humans handle the final mile with you.",
    },
  ] as const;

  return (
    <section className="py-10 sm:py-12">
      <SectionHeader title="Trust, without noise" subtitle="Designed for serious importers. Clean process, practical outputs." />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <Shield />
              <div>
                <div className="text-base font-semibold text-white">{it.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{it.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Already clear on what you want?</div>
            <div className="mt-1 text-sm text-neutral-300">
              Start the chat for clarity, then use token when you want supplier verification and execution.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/machine-sourcing"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
            >
              Start sourcing chat
            </Link>
            <Link
              href="https://paystack.shop/pay/sourcing"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
            >
              Get Sourcing Token
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ year }: { year: number }) {
  return (
    <footer className="border-t border-neutral-800 py-10">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/linescout-logo.png" alt="LineScout" width={120} height={28} className="h-[22px] w-auto" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            Nigeria-focused machine sourcing guidance and production line business plan writing.
          </p>
        </div>

        <FooterCol
          title="Product"
          links={[
            { href: "/machine-sourcing", label: "Sourcing chat" },
            { href: "/machine-sourcing", label: "Business plan writer" },
            { href: "https://paystack.shop/pay/sourcing", label: "Sourcing Token" },
            { href: "https://paystack.shop/pay/linescoutbusinessplan", label: "Business Plan Token" },
          ]}
        />

        <FooterCol
          title="Focus"
          links={[
            { href: "#how", label: "How it works" },
            { href: "#products", label: "Modes" },
            { href: "#prompts", label: "Example Prompts" },
          ]}
        />

        <div>
          <div className="text-sm font-semibold text-white">Notes</div>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <li className="flex gap-2">
              <Dot />
              Estimates not invoices
            </li>
            <li className="flex gap-2">
              <Dot />
              No supplier engagement until you’re ready to execute
            </li>
            <li className="flex gap-2">
              <Dot />
              Token unlocks execution support
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-2 border-t border-neutral-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-neutral-400">© {year} LineScout. Built by Sure Importers Limited in Nigeria.</div>
        <div className="text-xs text-neutral-400">Focused on machines. Built for Nigeria.</div>
      </div>
    </footer>
  );
}

function Divider() {
  return <div className="my-10 h-px w-full bg-neutral-800" />;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-300 sm:text-base">{subtitle}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs font-semibold text-neutral-200">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
      {children}
    </div>
  );
}

function Stat({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-xl">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-neutral-300">{body}</div>
    </div>
  );
}

function ProductCard({
  title,
  eyebrow,
  whoFor,
  youGet,
  microcopy,
  href,
  cta,
}: {
  title: string;
  eyebrow: string;
  whoFor: string[];
  youGet: string[];
  microcopy: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs font-semibold text-neutral-200">
          {eyebrow}
        </span>
        <span className="text-xs text-neutral-400">First-class feature</span>
      </div>

      <div className="mt-4 text-xl font-semibold tracking-tight text-white">{title}</div>
      <div className="mt-2 text-sm text-neutral-300">{microcopy}</div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Who it’s for</div>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            {whoFor.map((x) => (
              <li key={x} className="flex gap-2">
                <Dot />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">What you get</div>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            {youGet.map((x) => (
              <li key={x} className="flex gap-2">
                <Dot />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
        >
          {cta}
        </Link>
        <Link
          href="/machine-sourcing"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
        >
          Token unlocks execution
        </Link>
      </div>
    </div>
  );
}

function ModeRow({
  active,
  title,
  body,
  href,
  action,
}: {
  active?: boolean;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (active ? "border-neutral-700 bg-neutral-900/60" : "border-neutral-800 bg-neutral-950")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-neutral-300">{body}</div>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-700"
        >
          {action}
        </Link>
      </div>
    </div>
  );
}

function ExpectationRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-neutral-300">{body}</div>
    </div>
  );
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const id = `chip-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <button
      id={id}
      type="button"
      className="group inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-700"
      onClick={() => copyToClipboard(value)}
      aria-label={`Copy prompt: ${label}`}
      title="Click to copy"
    >
      <span className="truncate">{label}</span>
      <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-xs text-neutral-200 group-hover:border-neutral-700">
        Copy
      </span>
    </button>
  );
}

function copyToClipboard(text: string) {
  if (typeof window === "undefined") return;
  const safe = text.trim();
  if (!safe) return;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(safe).catch(() => fallbackCopy(safe));
  } else {
    fallbackCopy(safe);
  }
}

function fallbackCopy(text: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm font-medium text-neutral-300 hover:text-white">
      {children}
    </a>
  );
}

function PrimaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
    >
      {label}
    </Link>
  );
}

function SecondaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-3 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
    >
      {label}
    </Link>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href + l.label}>
            {l.href.startsWith("#") ? (
              <a href={l.href} className="text-neutral-300 hover:text-white hover:underline">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="text-neutral-300 hover:text-white hover:underline">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dot() {
  return <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-200" />;
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-neutral-200">
      <path
        d="M13 5l7 7-7 7M20 12H4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBadge() {
  return (
    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-800 bg-neutral-950">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-neutral-200">
        <path
          d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Shield() {
  return (
    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-800 bg-neutral-950">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-neutral-200">
        <path
          d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}