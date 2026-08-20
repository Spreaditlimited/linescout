import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Clock3, MailCheck, PlayCircle, ShieldCheck } from "lucide-react";

type Lesson = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type Faq = {
  question: string;
  answer: string;
};

type RelatedLink = {
  href: string;
  label: string;
  description: string;
};

type WebinarLeadLandingProps = {
  eyebrow: string;
  headline: string;
  introduction: string;
  durationLabel: string;
  form: ReactNode;
  lessons: Lesson[];
  lessonsCopy: string;
  contextHeading: string;
  contextParagraphs: string[];
  audienceHeading: string;
  audienceItems: string[];
  decisionHeading: string;
  decisionCopy: string;
  faqs: Faq[];
  relatedLinks: RelatedLink[];
};

export default function WebinarLeadLanding({
  eyebrow,
  headline,
  introduction,
  durationLabel,
  form,
  lessons,
  lessonsCopy,
  contextHeading,
  contextParagraphs,
  audienceHeading,
  audienceItems,
  decisionHeading,
  decisionCopy,
  faqs,
  relatedLinks,
}: WebinarLeadLandingProps) {
  return (
    <main className="min-h-[75vh] bg-slate-50 px-4 pb-24 pt-32 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto w-full max-w-4xl">
        <header className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <PlayCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-orange-600 dark:text-orange-400">
            {eyebrow}
          </p>
          <h1 className="mx-auto mt-3 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {headline}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {introduction}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-700 dark:text-blue-400" /> {durationLabel}
            </span>
            <span className="inline-flex items-center gap-2">
              <MailCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" /> Immediate email access
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" /> Free to watch
            </span>
          </div>
        </header>

        <article className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <header className="bg-slate-950 px-6 py-7 text-white sm:px-10 sm:py-9">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Free private access</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Watch the complete seminar</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Register once. We will send a protected viewing link that remains valid for 30 days.
                </p>
              </div>
              <span className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-blue-200">
                Delivered by email
              </span>
            </div>
          </header>

          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <section id="register" className="scroll-mt-28" aria-labelledby="registration-heading">
              <h2 id="registration-heading" className="text-xl font-bold text-slate-950 dark:text-white">
                Where should we send your access link?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Use an email address you can open now. The message may take a moment to arrive.
              </p>
              <div className="mt-6">{form}</div>
            </section>

            <section className="mt-10 border-t border-slate-200 pt-10 dark:border-slate-800" aria-labelledby="lessons-heading">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                Inside the seminar
              </p>
              <h2 id="lessons-heading" className="mt-3 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
                What you will be able to evaluate more clearly
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                {lessonsCopy}
              </p>

              <ol className="mt-7 border-t border-slate-200 dark:border-slate-800">
                {lessons.map((lesson, index) => (
                  <li key={lesson.title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-slate-200 py-6 dark:border-slate-800 sm:grid-cols-[3rem_1fr]">
                    <span className="pt-0.5 text-sm font-bold text-blue-700 dark:text-blue-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <lesson.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <h3 className="font-bold text-slate-950 dark:text-white">{lesson.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {lesson.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section
              className="mt-10 border-t border-slate-200 pt-10 dark:border-slate-800"
              aria-labelledby="seminar-context-heading"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                Practical sourcing context
              </p>
              <h2
                id="seminar-context-heading"
                className="mt-3 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl"
              >
                {contextHeading}
              </h2>
              <div className="mt-5 max-w-3xl space-y-5 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {contextParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>

            <section
              className="mt-10 border-t border-slate-200 pt-10 dark:border-slate-800"
              aria-labelledby="seminar-audience-heading"
            >
              <h2
                id="seminar-audience-heading"
                className="text-2xl font-bold text-slate-950 dark:text-white"
              >
                {audienceHeading}
              </h2>
              <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {audienceItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10 grid gap-6 border-t border-slate-200 pt-10 dark:border-slate-800 sm:grid-cols-[6rem_1fr] sm:items-start sm:gap-8">
              <Image
                src="/tochukwu.jpg"
                alt="Tochukwu Nkwocha, founder of Sure Imports"
                width={96}
                height={96}
                className="h-20 w-20 rounded-2xl object-cover sm:h-24 sm:w-24"
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                  Presented by Tochukwu Nkwocha
                </p>
                <h2 className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{decisionHeading}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{decisionCopy}</p>
                <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Founder, Sure Imports · Working in China sourcing since 2018
                </p>
              </div>
            </section>

            <section
              className="mx-auto mt-10 max-w-2xl border-t border-slate-200 pt-10 dark:border-slate-800"
              aria-labelledby="seminar-faq-heading"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                Common questions
              </p>
              <h2 id="seminar-faq-heading" className="mt-3 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">
                Before you register
              </h2>
              <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {faqs.map((faq) => (
                  <details key={faq.question} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-bold text-slate-950 marker:content-none dark:text-white [&::-webkit-details-marker]:hidden">
                      <span>{faq.question}</span>
                      <ChevronDown
                        className="h-5 w-5 shrink-0 text-blue-700 transition-transform duration-200 group-open:rotate-180 dark:text-blue-400"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="max-w-xl pb-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>

            <nav
              className="mt-10 border-t border-slate-200 pt-10 dark:border-slate-800"
              aria-label="Related sourcing resources"
            >
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">Continue with practical sourcing resources</h2>
              <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {relatedLinks.map((item) => (
                  <li key={item.href} className="py-4">
                    <Link
                      href={item.href}
                      className="font-bold text-blue-700 underline decoration-blue-200 underline-offset-4 transition hover:text-orange-600 hover:decoration-orange-300 dark:text-blue-300"
                    >
                      {item.label}
                    </Link>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </article>

        <p className="mt-5 text-center text-xs leading-6 text-slate-500 dark:text-slate-400">
          Already registered? Submit the same email address and we will send your access link again.
        </p>
      </div>
    </main>
  );
}
