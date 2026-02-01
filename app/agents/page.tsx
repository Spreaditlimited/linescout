import FooterGate from "@/components/FooterGate";

export const metadata = {
  title: "LineScout Agents Agreement",
};

export default function AgentsAgreementPage() {
  return (
    <>
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="relative overflow-hidden border-b border-neutral-800">
          <div className="absolute -top-24 right-[-120px] h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-24 left-[-120px] h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-14">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              LineScout Agents Agreement
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              LineScout Agents Agreement & Operational Policy
            </h1>
            <p className="max-w-2xl text-sm text-neutral-300 sm:text-base">
              This agreement governs participation in the LineScout Agent program. It outlines service standards,
              workflow expectations, and compliance requirements for agents who source products on behalf of
              LineScout customers.
            </p>
            <div className="text-xs text-neutral-400">Last updated: January 31, 2026</div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="grid gap-6 md:grid-cols-[1.4fr_0.9fr]">
            <section className="space-y-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">1. Eligibility & Scope</h2>
              <p className="mt-2 text-sm text-neutral-300">
                LineScout Agents are independent service providers who source products, gather supplier
                information, and support customer decision-making. Agents must comply with all applicable laws
                in China and any local regulations related to sourcing, product handling, and communications.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">2. Account & Security</h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Keep login credentials confidential and use strong passwords.</li>
                <li>Do not share accounts or allow unauthorized access.</li>
                <li>Update your profile details promptly and accurately.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">3. Conduct & Communications</h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Communicate respectfully with customers and LineScout staff.</li>
                <li>Use the LineScout chat platform for all project-related discussions.</li>
                <li>Do not request off-platform payments or share personal payment details.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">4. Sourcing Workflow</h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Clarify requirements: specs, quantity, materials, branding, packaging, and target usage.</li>
                <li>Confirm supplier credibility and verify product details before sharing quotes.</li>
                <li>Upload clear media (photos, PDFs, or documents) to support decisions.</li>
                <li>Keep project status updated inside the LineScout agent app.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">5. Quote Standards</h2>
              <p className="mt-2 text-sm text-neutral-300">
                Quotes must be complete, transparent, and accurate. All quotes are provided in NGN and must
                reflect approved exchange rates and shipping rates set by LineScout.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Itemize product name, quantity, unit price (RMB), and total price.</li>
                <li>Include unit and total weight (kg) and unit and total CBM.</li>
                <li>Apply the latest LineScout shipping policies.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">6. Payments & Earnings</h2>
              <p className="mt-2 text-sm text-neutral-300">
                Agent earnings are credited to your LineScout wallet after successful sourcing milestones. Any
                withdrawal requires a payout request and is subject to review and compliance checks.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Do not request direct payment from customers.</li>
                <li>Commissions and pricing policies are set by LineScout and may change.</li>
                <li>Wallet balances may be withheld for investigation of violations or disputes.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">7. Compliance & Documentation</h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Provide accurate identity and banking details during KYC.</li>
                <li>Share authentic supplier documentation when requested.</li>
                <li>Report any suspected fraud or misuse to LineScout immediately.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">8. Confidentiality & Data</h2>
              <p className="mt-2 text-sm text-neutral-300">
                All customer and supplier information is confidential. You may not disclose, reuse, or sell
                any data accessed through LineScout. Content uploaded to the platform is solely for fulfillment
                of LineScout projects.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">9. Suspension & Termination</h2>
              <p className="mt-2 text-sm text-neutral-300">
                LineScout may suspend or terminate any agent account for policy violations, fraud, harassment,
                data misuse, or failure to meet service standards.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold">10. Contact</h2>
              <p className="mt-2 text-sm text-neutral-300">
                For questions or clarifications, contact the LineScout approval team at
                <span className="text-emerald-200"> hello@sureimports.com</span>.
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
              <h3 className="text-sm font-semibold text-neutral-200">Key Commitments</h3>
              <ul className="mt-3 space-y-2 text-sm text-neutral-300">
                <li>Use the LineScout app for all customer communications.</li>
                <li>Maintain accurate quotes and status updates.</li>
                <li>Respect confidentiality and data protection policies.</li>
                <li>Follow approved pricing, shipping, and payout policies.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
              <h3 className="text-sm font-semibold text-neutral-200">Company Details</h3>
              <p className="mt-2 text-sm text-neutral-300">Sure Importers Limited</p>
              <p className="text-sm text-neutral-400">5 Olutosin Ajayi Street, Ajao Estate, Lagos, Nigeria</p>
              <p className="mt-2 text-sm text-neutral-300">hello@sureimports.com</p>
              <p className="mt-2 text-xs text-neutral-500">LineScout is a registered trademark of Sure Importers Limited in Nigeria.</p>
            </div>
            </aside>
          </div>
        </div>
      </main>
      <FooterGate />
    </>
  );
}
