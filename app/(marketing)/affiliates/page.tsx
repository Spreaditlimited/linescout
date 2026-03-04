import Link from "next/link";
import MarketingTopNav from "@/components/MarketingTopNav";
import Footer from "@/components/Footer";

const brandBlue = "#2D3461";

export default function AffiliatesLandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#F5F6FA] text-neutral-900" style={{ ["--agent-blue" as any]: brandBlue }}>
      <MarketingTopNav
        accentClassName="text-[var(--agent-blue)]"
        navHoverClassName="hover:text-[var(--agent-blue)]"
        buttonTextClassName="text-[var(--agent-blue)]"
        menuHoverClassName="hover:text-[var(--agent-blue)]"
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-3 py-1 text-[11px] font-semibold text-[var(--agent-blue)] sm:text-xs">
              LineScout affiliates
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Earn when your referrals pay for sourcing, shipping, and every future LineScout service.
            </h1>
            <p className="mt-4 text-base text-neutral-600 sm:text-lg">
              You get a permanent referral link. We track your referrals across web and mobile. Earnings are
              calculated per transaction type.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/affiliates/sign-in"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
              >
                Affiliate sign in
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
              >
                Start sourcing
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">How it works</p>
            <div className="mt-4 space-y-4 text-sm text-neutral-600">
              <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-4">
                <div className="text-xs font-semibold text-[var(--agent-blue)]">1. Share your link</div>
                <div className="mt-1">Your referral link permanently ties new signups to you.</div>
              </div>
              <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-4">
                <div className="text-xs font-semibold text-[var(--agent-blue)]">2. They pay</div>
                <div className="mt-1">You earn when they pay commitment fees, project costs, or shipping.</div>
              </div>
              <div className="rounded-2xl border border-[rgba(45,52,97,0.14)] bg-[rgba(45,52,97,0.04)] p-4">
                <div className="text-xs font-semibold text-[var(--agent-blue)]">3. Request payout</div>
                <div className="mt-1">Request payout once you hit the minimum payout for your country.</div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer variant="agent" />
    </div>
  );
}
