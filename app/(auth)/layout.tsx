import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LineScout | Sign In",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[100dvh] h-[100svh] max-h-[100dvh] overflow-hidden overscroll-none bg-[#FCFCFD] text-neutral-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-120px] h-[380px] w-[380px] rounded-full bg-[rgba(249,90,14,0.12)] blur-3xl" />
        <div className="absolute -bottom-40 left-[-140px] h-[360px] w-[360px] rounded-full bg-[rgba(45,52,97,0.12)] blur-3xl" />
      </div>
      <div className="relative flex h-full items-center justify-center px-6">
        {children}
      </div>
    </div>
  );
}
