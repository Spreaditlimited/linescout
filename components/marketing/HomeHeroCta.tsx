"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ComingSoonModal from "@/components/ComingSoonModal";

export default function HomeHeroCta() {
  const [showAppModal, setShowAppModal] = useState(false);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowAppModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--agent-blue)] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
        >
          Get the app <ArrowRight className="h-4 w-4" />
        </button>
        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:border-[rgba(45,52,97,0.35)]"
        >
          Start on the web
        </Link>
      </div>

      <ComingSoonModal
        open={showAppModal}
        title="LineScout Mobile App"
        message="We are putting the finishing touches on the app experience. Join the web experience now and you will be first to know when the app ships."
        onClose={() => setShowAppModal(false)}
      />
    </>
  );
}
