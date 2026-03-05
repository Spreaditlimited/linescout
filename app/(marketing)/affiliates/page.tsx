import Link from "next/link";
import MarketingTopNav from "@/components/MarketingTopNav";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import { ensureAffiliateTables } from "@/lib/affiliates";

const brandBlue = "#2D3461";

export const metadata = {
  title: "LineScout Affiliate Program | Earn On Every Referral Payment",
  description:
    "Share your LineScout referral link and earn commissions when your referrals pay for sourcing, shipping, and future services. Track activity and request payouts when you hit your country minimum.",
  openGraph: {
    title: "LineScout Affiliate Program",
    description:
      "Share your LineScout referral link and earn commissions when your referrals pay for sourcing, shipping, and future services.",
    images: [{ url: "/affiliate-feature.png", width: 1200, height: 630, alt: "LineScout Affiliate Program" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LineScout Affiliate Program",
    description:
      "Share your LineScout referral link and earn commissions when your referrals pay for sourcing, shipping, and future services.",
    images: ["/affiliate-feature.png"],
  },
};

type CommissionRule = {
  transaction_type: string;
  mode: string;
  value: number;
  currency?: string | null;
};

function formatRule(rule?: CommissionRule | null) {
  if (!rule) return "Set by LineScout admin";
  const mode = String(rule.mode || "percent").toLowerCase();
  const value = Number(rule.value || 0);
  if (!Number.isFinite(value) || value <= 0) return "Set by LineScout admin";
  if (mode === "flat") {
    const currency = String(rule.currency || "NGN").toUpperCase();
    return `${currency} ${value.toLocaleString()}`;
  }
  return `${value.toFixed(2)}%`;
}

export default async function AffiliatesLandingPage() {
  const conn = await db.getConnection();
  let rules: CommissionRule[] = [];
  try {
    await ensureAffiliateTables(conn);
    const [rows]: any = await conn.query(
      `SELECT transaction_type, mode, value, currency
       FROM linescout_affiliate_commission_rules
       WHERE is_active = 1`
    );
    rules = Array.isArray(rows) ? rows : [];
  } catch {
    rules = [];
  } finally {
    conn.release();
  }

  const getRule = (type: string) => rules.find((r) => String(r.transaction_type || "") === type) || null;

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
              Get paid every time your{" "}
              <br className="hidden lg:block" />
              referrals pay LineScout.
            </h1>
            <p className="mt-4 text-base text-neutral-600 sm:text-lg">
              Share your referral link once. When your people pay for sourcing, shipping, or any future LineScout
              service, you earn — every time.
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

        <section className="mt-12 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              What you earn
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-neutral-900">Clear rates, paid per transaction.</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Earnings are calculated on every payment your referrals make — not just on sign‑up.
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              Commitment fees
            </div>
            <div className="mt-3 text-2xl font-semibold text-neutral-900">{formatRule(getRule("commitment_fee"))}</div>
            <p className="mt-2 text-sm text-neutral-600">Earn when a referral pays a commitment fee to start sourcing.</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              Project payments
            </div>
            <div className="mt-3 text-2xl font-semibold text-neutral-900">{formatRule(getRule("project_payment"))}</div>
            <p className="mt-2 text-sm text-neutral-600">
              You earn whenever they pay for sourcing projects and services.
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              Shipping payments
            </div>
            <div className="mt-3 text-2xl font-semibold text-neutral-900">{formatRule(getRule("shipping_payment"))}</div>
            <p className="mt-2 text-sm text-neutral-600">Get paid when your referrals pay for shipping.</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
              Future services
            </div>
            <div className="mt-3 text-2xl font-semibold text-neutral-900">{formatRule(getRule("future_service"))}</div>
            <p className="mt-2 text-sm text-neutral-600">
              Earn on any new LineScout services your referrals use in the future.
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payouts</div>
            <h3 className="mt-3 text-xl font-semibold text-neutral-900">Global payouts, built for trust.</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Nigerian affiliates are paid via Paystack. Global affiliates are paid via PayPal after approval.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-[28px] border border-[rgba(45,52,97,0.12)] bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--agent-blue)]">
                Built on experience
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-neutral-900 sm:text-3xl">
                A sourcing team trusted since 2018.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600">
                LineScout is built by a team that has sourced products since 2018, with over 40,000 registered users.
              </p>
            </div>
            <div className="rounded-2xl border border-[rgba(45,52,97,0.18)] bg-[rgba(45,52,97,0.06)] px-4 py-2 text-xs font-semibold text-[var(--agent-blue)]">
              40,000+ users
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-700">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Since 2018</div>
              <div className="mt-2 font-semibold text-neutral-900">Deep sourcing experience</div>
              <div className="mt-1 text-sm text-neutral-600">Real pricing, supplier vetting, and delivery execution.</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-700">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Global reach</div>
              <div className="mt-2 font-semibold text-neutral-900">Web + mobile tracking</div>
              <div className="mt-1 text-sm text-neutral-600">Your referrals are tracked across platforms automatically.</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-700">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Always on</div>
              <div className="mt-2 font-semibold text-neutral-900">Earn on repeat payments</div>
              <div className="mt-1 text-sm text-neutral-600">Every qualifying payment counts, not just the first.</div>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-neutral-900">Ready to start earning?</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Get your referral link in minutes and start earning when your referrals pay.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/affiliates/sign-in"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
            >
              Join the affiliate program
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(45,52,97,0.2)] bg-white px-6 py-3 text-sm font-semibold text-[var(--agent-blue)]"
            >
              Start sourcing
            </Link>
          </div>
        </section>
      </main>

      <Footer variant="agent" />
    </div>
  );
}
