"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");

  return (
    <div className="min-h-screen flex flex-col">
      {!isInternal ? <Navbar /> : null}
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}