import { Suspense } from "react";
import Link from "next/link";
import AffiliateEmailOtpForm from "@/components/auth/AffiliateEmailOtpForm";

export default function AffiliateSignInPage() {
  return (
    <div className="relative h-[100dvh] h-[100svh] max-h-[100dvh] overflow-hidden overscroll-none bg-[#F7F6F2] text-neutral-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-120px] h-[380px] w-[380px] rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="absolute -bottom-40 left-[-140px] h-[360px] w-[360px] rounded-full bg-emerald-100/70 blur-3xl" />
      </div>
      <div className="relative flex h-full items-center justify-center px-6">
        <div className="flex w-full flex-col items-center gap-6">
          <Link href="/" className="btn btn-ghost text-xs">
            ← Back to home
          </Link>
          <Suspense fallback={null}>
            <AffiliateEmailOtpForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
