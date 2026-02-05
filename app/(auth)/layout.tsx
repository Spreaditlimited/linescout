import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LineScout | Sign In",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#F7F6F2] text-neutral-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-[-120px] h-[380px] w-[380px] rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="absolute -bottom-40 left-[-140px] h-[360px] w-[360px] rounded-full bg-emerald-100/70 blur-3xl" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        {children}
      </div>
    </div>
  );
}
