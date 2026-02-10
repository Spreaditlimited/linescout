import Footer from "@/components/Footer";
import MarketingFrame from "@/components/MarketingFrame";
import MarketingTopNav from "@/components/MarketingTopNav";

export const metadata = {
  title: "LineScout Agents Agreement",
};

export default function AgentsAgreementPage() {
  const brandBlue = "#2D3461";
  return (
    <MarketingFrame>
      <div
        className="relative flex min-h-screen flex-col bg-[#F5F6FA] text-neutral-900"
        style={{ ["--agent-blue" as any]: brandBlue }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-[-180px] h-[420px] w-[420px] rounded-full bg-[rgba(45,52,97,0.18)] blur-3xl" />
          <div className="absolute -bottom-40 left-[-140px] h-[380px] w-[380px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
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
          <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10 sm:px-6 md:pt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
              LineScout Agents Agreement
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              LineScout Agents Agreement & Operational Policy
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-neutral-600 sm:text-base">
              This agreement governs participation in the LineScout Agent program. It outlines service standards,
              workflow expectations, and compliance requirements for agents who source products on behalf of
              LineScout customers.
            </p>
            <div className="mt-2 text-xs text-neutral-500">Last updated: January 31, 2026</div>
          </section>

          <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
            <div className="grid gap-6 md:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-6">
                {[
                  {
                    title: "1. Eligibility & Scope",
                    body:
                      "LineScout Agents are independent service providers who source products, gather supplier information, and support customer decision-making. Agents must comply with all applicable laws in China and any local regulations related to sourcing, product handling, and communications.",
                  },
                  {
                    title: "2. Account & Security",
                    body:
                      "Keep login credentials confidential, do not share accounts, and keep profile details accurate and updated.",
                    bullets: [
                      "Keep login credentials confidential and use strong passwords.",
                      "Do not share accounts or allow unauthorized access.",
                      "Update your profile details promptly and accurately.",
                    ],
                  },
                  {
                    title: "3. Conduct & Communications",
                    bullets: [
                      "Communicate respectfully with customers and LineScout staff.",
                      "Use the LineScout chat platform for all project-related discussions.",
                      "Do not request off-platform payments or share personal payment details.",
                    ],
                  },
                  {
                    title: "4. Sourcing Workflow",
                    bullets: [
                      "Clarify requirements: specs, quantity, materials, branding, packaging, and target usage.",
                      "Confirm supplier credibility and verify product details before sharing quotes.",
                      "Upload clear media (photos, PDFs, or documents) to support decisions.",
                      "Keep project status updated inside the LineScout agent app.",
                    ],
                  },
                  {
                    title: "5. Quote Standards",
                    body:
                      "Quotes must be complete, transparent, and accurate. All quotes are provided in NGN and must reflect approved exchange rates and shipping rates set by LineScout.",
                    bullets: [
                      "Itemize product name, quantity, unit price (RMB), and total price.",
                      "Include unit and total weight (kg) and unit and total CBM.",
                      "Apply the latest LineScout shipping policies.",
                    ],
                  },
                  {
                    title: "6. Payments & Earnings",
                    body:
                      "Agent earnings are credited to your LineScout wallet after successful sourcing milestones. Any withdrawal requires a payout request and is subject to review and compliance checks.",
                    bullets: [
                      "Do not request direct payment from customers.",
                      "Commissions and pricing policies are set by LineScout and may change.",
                      "Wallet balances may be withheld for investigation of violations or disputes.",
                    ],
                  },
                  {
                    title: "7. Compliance & Documentation",
                    bullets: [
                      "Provide accurate identity and banking details during KYC.",
                      "Share authentic supplier documentation when requested.",
                      "Report any suspected fraud or misuse to LineScout immediately.",
                    ],
                  },
                  {
                    title: "8. Confidentiality & Data",
                    body:
                      "All customer and supplier information is confidential. You may not disclose, reuse, or sell any data accessed through LineScout. Content uploaded to the platform is solely for fulfillment of LineScout projects.",
                  },
                  {
                    title: "9. Suspension & Termination",
                    body:
                      "LineScout may suspend or terminate any agent account for policy violations, fraud, harassment, data misuse, or failure to meet service standards.",
                  },
                  {
                    title: "10. Contact",
                    body:
                      "For questions or clarifications, contact the LineScout approval team at hello@sureimports.com.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm"
                  >
                    <h2 className="text-lg font-semibold text-neutral-900">{item.title}</h2>
                    {item.body ? (
                      <p className="mt-2 text-sm text-neutral-600">{item.body}</p>
                    ) : null}
                    {item.bullets ? (
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600">
                        {item.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>

              <aside className="space-y-6">
                <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-900">Key Commitments</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600">
                    <li>Use the LineScout app for all customer communications.</li>
                    <li>Maintain accurate quotes and status updates.</li>
                    <li>Respect confidentiality and data protection policies.</li>
                    <li>Follow approved pricing, shipping, and payout policies.</li>
                  </ul>
                </div>

                <div className="rounded-3xl border border-[rgba(45,52,97,0.14)] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-neutral-900">Company Details</h3>
                  <p className="mt-2 text-sm text-neutral-700">Sure Importers Limited</p>
                  <p className="text-sm text-neutral-500">
                    5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria
                  </p>
                  <p className="mt-2 text-sm text-neutral-700">hello@sureimports.com</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    LineScout is a registered trademark of Sure Importers Limited in Nigeria.
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </main>

        <Footer variant="agent" />
      </div>
    </MarketingFrame>
  );
}
