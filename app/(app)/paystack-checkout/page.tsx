import { Suspense } from "react";
import PaystackCheckoutClient from "./PaystackCheckoutClient";

function Fallback() {
  return (
    <div className="flex min-h-[70vh] items-center px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <p className="mx-auto text-xs font-semibold uppercase tracking-[0.2em] text-[var(--agent-blue)]">
            Secure checkout
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Complete your payment</h1>
          <p className="mt-2 text-sm text-neutral-600">Preparing checkout…</p>
        </div>
      </div>
    </div>
  );
}

export default function PaystackCheckoutPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <PaystackCheckoutClient />
    </Suspense>
  );
}
