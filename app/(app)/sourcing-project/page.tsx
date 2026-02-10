import { Suspense } from "react";
import SourcingProjectClient from "./SourcingProjectClient";

function Fallback() {
  return (
    <div className="px-6 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
        Loading…
      </div>
    </div>
  );
}

export default function SourcingProjectPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <SourcingProjectClient />
    </Suspense>
  );
}
