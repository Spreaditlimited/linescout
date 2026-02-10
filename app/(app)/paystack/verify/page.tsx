import { Suspense } from "react";
import PaystackVerifyClient from "./PaystackVerifyClient";

export const dynamic = "force-dynamic";

function Fallback() {
  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">Payment verification</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Verifying payment</h1>
          <p className="mt-2 text-sm text-neutral-600">We’re preparing verification.</p>
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            Loading…
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaystackVerifyPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <PaystackVerifyClient />
    </Suspense>
  );
}
