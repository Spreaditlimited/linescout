"use client";

import Navbar from "@/components/Navbar";
import FooterGate from "@/components/FooterGate";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0B0B0E] text-neutral-100">
      <Navbar />
      <div className="flex-1 min-h-0">
        {children}
      </div>
      <FooterGate />
    </div>
  );
}