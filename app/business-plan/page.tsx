import BusinessPlanForm from "@/components/BusinessPlanForm";
import { FileText, ShieldCheck, Sparkles } from "lucide-react";

export default function BusinessPlanPage() {
  return (
    <div className="relative overflow-hidden bg-slate-50 text-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_85%_10%,rgba(249,115,22,0.16),transparent_34%),radial-gradient(circle_at_15%_5%,rgba(49,46,129,0.12),transparent_30%)]" />
      <main className="relative mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <section className="si-hero mx-auto max-w-4xl py-16 text-center lg:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
            <Sparkles className="h-4 w-4" /> LineScout planning tool
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Turn your sourcing idea into a clear business plan
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Share the essentials about your product and market. LineScout will organize them into a practical,
            professional plan you can use to assess the opportunity and prepare for sourcing.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200"><FileText className="h-4 w-4 text-orange-500" /> Structured output</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200"><ShieldCheck className="h-4 w-4 text-indigo-700" /> Your details stay private</span>
          </div>
        </section>

        <section className="mx-auto my-16 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
          <BusinessPlanForm />
        </section>
      </main>
    </div>
  );
}
