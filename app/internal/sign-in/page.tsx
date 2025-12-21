// app/internal/sign-in/page.tsx
import { Suspense } from "react";
import InternalSignInClient from "./InternalSignInClient";

export default function InternalSignInPage() {
  return (
    <Suspense fallback={<InternalSignInSkeleton />}>
      <InternalSignInClient />
    </Suspense>
  );
}

function InternalSignInSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 shadow-xl">
          <div className="p-6">
            <div className="h-6 w-40 bg-neutral-800 rounded mb-3" />
            <div className="h-4 w-64 bg-neutral-800 rounded mb-6" />

            <div className="space-y-4">
              <div className="h-10 bg-neutral-900 rounded-xl border border-neutral-800" />
              <div className="h-10 bg-neutral-900 rounded-xl border border-neutral-800" />
              <div className="h-11 bg-neutral-200 rounded-xl" />
            </div>
          </div>
        </div>

        <div className="h-4 w-40 bg-neutral-900 rounded mt-4 mx-auto" />
      </div>
    </div>
  );
}