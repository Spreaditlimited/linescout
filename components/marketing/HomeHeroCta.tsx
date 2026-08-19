"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomeHeroCta() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/sign-in?next=/projects/new"
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
      >
        Start Sourcing <ArrowRight className="h-4 w-4" />
      </Link>
      <Link
        href="/white-label"
        className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:border-[rgba(45,52,97,0.35)]"
      >
        View Products
      </Link>
    </div>
  );
}
