import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  PlayCircle,
} from "lucide-react";

type ViewingPoint = {
  title: string;
  description: string;
};

type WebinarViewingPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  duration: string;
  videoTitle: string;
  videoUrl?: string;
  viewingHeading: string;
  viewingCopy: string;
  viewingPoints: ViewingPoint[];
  nextStepEyebrow: string;
  nextStepHeading: string;
  nextStepCopy: string;
  primaryAction: {
    label: string;
    href: string;
    icon: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
};

export default function WebinarViewingPage({
  eyebrow,
  title,
  introduction,
  duration,
  videoTitle,
  videoUrl,
  viewingHeading,
  viewingCopy,
  viewingPoints,
  nextStepEyebrow,
  nextStepHeading,
  nextStepCopy,
  primaryAction,
  secondaryAction,
}: WebinarViewingPageProps) {
  const PrimaryIcon = primaryAction.icon;

  return (
    <main className="overflow-x-clip bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="relative overflow-hidden bg-[linear-gradient(115deg,#11153A_0%,#050817_58%,#2A1115_100%)] px-4 pb-20 pt-32 text-white sm:px-6 lg:pb-24 lg:pt-36">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -right-36 top-0 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto min-w-0 w-full max-w-5xl">
          <div className="min-w-0 max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {eyebrow}
            </p>
            <h1 className="mt-5 break-words text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              {introduction}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-orange-400" aria-hidden="true" />
                {duration}
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-orange-400" aria-hidden="true" />
                Your access is confirmed
              </span>
            </div>
          </div>

          <div className="mt-10 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40 sm:rounded-3xl">
            <div className="aspect-video w-full">
              {videoUrl ? (
                <iframe
                  title={videoTitle}
                  src={videoUrl}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
                  <PlayCircle className="h-10 w-10 text-orange-400" aria-hidden="true" />
                  <p className="text-sm font-semibold">The seminar video is being prepared.</p>
                  <p className="max-w-md text-xs leading-5 text-slate-400">
                    Please return using the access link in your email. Your access remains valid.
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-slate-400">
            This is a private viewing page. Keep the access link from your registration email for future visits.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <article className="mx-auto min-w-0 w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
              Watch with purpose
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{viewingHeading}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              {viewingCopy}
            </p>

            <ol className="mt-8 border-t border-slate-200 dark:border-slate-800">
              {viewingPoints.map((point, index) => (
                <li
                  key={point.title}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-slate-200 py-6 dark:border-slate-800 sm:grid-cols-[3rem_1fr]"
                >
                  <span className="pt-0.5 text-sm font-bold text-blue-700 dark:text-blue-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words font-bold text-slate-950 dark:text-white">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {point.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">
              {nextStepEyebrow}
            </p>
            <div className="mt-3 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">{nextStepHeading}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{nextStepCopy}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href={primaryAction.href}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  <PrimaryIcon className="h-4 w-4" aria-hidden="true" />
                  {primaryAction.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {secondaryAction ? (
                  <Link
                    href={secondaryAction.href}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    {secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
