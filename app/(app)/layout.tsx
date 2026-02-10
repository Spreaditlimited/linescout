import { Suspense } from "react";
import AppShell from "@/components/app/AppShell";

function AppShellFallback() {
  return (
    <div className="min-h-screen bg-[#F5F6FA] text-neutral-900">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-8">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
          Loading…
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
