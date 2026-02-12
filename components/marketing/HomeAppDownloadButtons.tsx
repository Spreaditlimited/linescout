"use client";

import { useState } from "react";
import ComingSoonModal from "@/components/ComingSoonModal";

export default function HomeAppDownloadButtons() {
  const [showAppModal, setShowAppModal] = useState(false);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowAppModal(true)}
          className="rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white"
        >
          Download on iOS
        </button>
        <button
          type="button"
          onClick={() => setShowAppModal(true)}
          className="rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-xs font-semibold text-white"
        >
          Get it on Android
        </button>
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
