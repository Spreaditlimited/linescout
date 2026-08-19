import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Headphones,
  MessageSquareText,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type Capability = {
  title: string;
  description: string;
  icon: LucideIcon;
  detail: string;
};

const workflow = [
  {
    step: "01",
    title: "Claim the right assignment",
    description:
      "Review paid sourcing requests, understand the customer context and take ownership of work you can execute well.",
    icon: ClipboardCheck,
  },
  {
    step: "02",
    title: "Run the sourcing conversation",
    description:
      "Keep requirements, supplier findings, files and customer decisions together instead of scattering the project across chats.",
    icon: MessageSquareText,
  },
  {
    step: "03",
    title: "Quote, update and deliver",
    description:
      "Build structured quotes, manage project progress, handle repeat orders and keep the customer informed through completion.",
    icon: PackageCheck,
  },
];

const capabilities: Capability[] = [
  {
    title: "Paid chat inbox",
    description: "See available conversations, claim qualified work and respond with the full handoff context in view.",
    icon: MessageSquareText,
    detail: "Claim · reply · escalate",
  },
  {
    title: "Project ownership",
    description: "Separate unclaimed opportunities from your active projects and follow each sourcing assignment clearly.",
    icon: BriefcaseBusiness,
    detail: "Queue · ownership · progress",
  },
  {
    title: "Quote builder",
    description: "Prepare customer-ready sourcing quotes from the same workspace where the requirements were discussed.",
    icon: FileText,
    detail: "Costs · additions · delivery",
  },
  {
    title: "Reorder management",
    description: "Bring delivered projects back into an organised workflow when customers need another production run.",
    icon: RefreshCcw,
    detail: "Review · restart · close",
  },
  {
    title: "Earnings and payouts",
    description: "See available, locked and paid earnings, maintain a verified payout account and submit requests.",
    icon: WalletCards,
    detail: "Commission · rewards · history",
  },
  {
    title: "Agent verification",
    description: "Manage the identity, contact, China address and bank checks required for trusted agent operations.",
    icon: UserCheck,
    detail: "Identity · address · bank",
  },
  {
    title: "Operational updates",
    description: "Receive workspace notices and manage email preferences for handoff and payout information.",
    icon: BellRing,
    detail: "Notices · preferences · action",
  },
  {
    title: "Agent support",
    description: "Raise a support request from settings when an account, project or payout issue needs internal help.",
    icon: Headphones,
    detail: "Request · follow-up · resolution",
  },
];

const controls = [
  "Approved-agent access",
  "Structured project ownership",
  "Traceable customer communication",
  "Verified payout information",
];

export default function AgentAppLandingPage() {
  return (
    <main className="overflow-hidden bg-[#f5f6fa] text-slate-950">
      <section className="si-hero relative overflow-hidden pb-24 pt-14 sm:pt-20 lg:pb-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -right-48 -top-48 h-[34rem] w-[34rem] rounded-full bg-orange-500/15 blur-3xl" />
          <div className="absolute -bottom-64 left-1/4 h-[36rem] w-[36rem] rounded-full bg-blue-600/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>

        <div className="relative mx-4 grid min-w-0 max-w-7xl items-center gap-14 sm:mx-auto sm:w-full sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-[10px] font-bold uppercase leading-4 tracking-[0.12em] text-orange-300 sm:rounded-full sm:px-4 sm:text-xs sm:tracking-[0.16em]">
              <BadgeCheck className="h-4 w-4 shrink-0" />
              <span>Private workspace for approved agents</span>
            </div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              Run every sourcing assignment from one operating desk.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              LineScout gives sourcing agents one place to claim paid work, manage customer conversations,
              coordinate projects, prepare quotes, handle reorders and track earnings.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/agent-app/sign-in"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-orange-950/30 transition hover:bg-orange-600 sm:w-auto"
              >
                Sign in to workspace <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/agent-app/sign-up"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15 sm:w-auto"
              >
                Create agent account
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-orange-400" /> Approval required</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-orange-400" /> Secure web workspace</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-orange-400" /> Powered by Sure Imports</span>
            </div>
          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-8 rounded-full bg-orange-500/10 blur-3xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/80 p-3 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="rounded-[1.45rem] border border-white/10 bg-[#111b35] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">Agent operations</p>
                    <p className="mt-2 text-xl font-bold text-white">Today&apos;s workspace</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Online
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    ["4", "Open chats"],
                    ["7", "My projects"],
                    ["2", "Quotes due"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 sm:p-4">
                      <p className="text-2xl font-black text-white">{value}</p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-white">Priority queue</p>
                    <span className="text-xs font-semibold text-orange-300">View inbox</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Packaging machine", "New paid handoff", "Claim"],
                      ["Branded drinkware", "Supplier update due", "Open"],
                      ["Repeat production", "Reorder awaiting review", "Review"],
                    ].map(([title, status, action], index) => (
                      <div key={title} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${index === 0 ? "bg-orange-500 text-white" : "bg-white/10 text-slate-300"}`}>
                          {index === 0 ? <MessageSquareText className="h-4 w-4" /> : index === 1 ? <BriefcaseBusiness className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{title}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{status}</p>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold text-slate-200">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-orange-500 px-4 py-3 text-white">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-100">Available earnings</p>
                    <p className="mt-1 text-lg font-black">Payout-ready balance</p>
                  </div>
                  <CircleDollarSign className="h-7 w-7" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-9 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Paid work", "A clear queue of customer-funded assignments"],
            ["One record", "Messages, files, quotes and status together"],
            ["Repeat orders", "Bring successful projects back into motion"],
            ["Clear earnings", "Commission, rewards and payout history"],
          ].map(([title, description], index) => (
            <div key={title} className={`p-6 ${index ? "border-t border-slate-200 sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-t lg:border-t-0" : ""}`}>
              <p className="text-sm font-black text-slate-950">{title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">A disciplined workflow</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              From paid handoff to a completed sourcing project.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              The workspace follows the real work an agent performs. It keeps ownership clear and gives every customer interaction a project context.
            </p>
            <Link href="/agent-app/sign-in" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-orange-600">
              Enter the agent workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4">
            {workflow.map((item) => (
              <article key={item.step} className="group grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600">Step {item.step}</p>
                  <h3 className="mt-2 text-lg font-black text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
                <CheckCircle2 className="hidden h-6 w-6 text-emerald-500 sm:block" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20 lg:py-28">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Inside the workspace</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              The tools agents need to execute—not another generic dashboard.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Each area supports a specific part of sourcing operations, from taking responsibility for a request to receiving earned payouts.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((item) => (
              <article key={item.title} className="flex min-h-64 flex-col rounded-3xl border border-slate-200 bg-[#f8fafc] p-6 transition hover:border-orange-200 hover:bg-orange-50/40">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{item.description}</p>
                <p className="mt-5 border-t border-slate-200 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-28">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Trust is operational</p>
          <h2 className="mt-4 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
            Built for accountable sourcing work.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Agent access is approval-based. Identity, operating address and payout details are kept inside a controlled account, while project ownership and customer communication remain visible within the workflow.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {controls.map((control) => (
              <div key={control} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-bold text-slate-100">
                <ShieldCheck className="h-5 w-5 shrink-0 text-orange-400" /> {control}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <CircleDollarSign className="h-6 w-6" />
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-orange-600">Earnings visibility</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Know what you earned and what is available.</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Review commission information, locked and available balances, reward value and payout history before submitting a withdrawal request to your verified account.
            </p>
          </div>
          <Link href="/agent-app/sign-in" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-orange-600">
            View your earnings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 overflow-hidden rounded-[2rem] bg-[linear-gradient(110deg,#11153a_0%,#050817_58%,#2a1115_100%)] px-7 py-12 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-14 lg:py-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Approved agents</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              Your next sourcing assignment starts in LineScout.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Sign in to continue working, or create an account to begin the agent approval process.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/agent-app/sign-in" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600">
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/agents" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white/15">
              Review agent agreement
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
