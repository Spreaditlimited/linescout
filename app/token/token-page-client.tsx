"use client";

import Link from "next/link";
// IMPORTANT: In Step 2 we will create this component by extracting from machine-sourcing
import TokenPanel from "../../components/TokenPanel";


export default function TokenPageClient() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-neutral-400 hover:text-white">
            ← Back to LineScout
          </Link>

          <h1 className="mt-3 text-2xl font-semibold">Buy or verify your Sourcing token</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Purchase a token, verify it, and move straight to sourcing processing. Note that this payment is credited back to you when you proceed with the procurement. This is only a commitment fee.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <TokenPanel />
        </div>
      </div>
    </div>
  );
}