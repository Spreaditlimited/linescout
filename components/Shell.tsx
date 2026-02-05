"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isLanding = pathname === "/";

  return (
    <div className={isLanding ? "flex min-h-screen flex-col" : "min-h-screen flex flex-col"}>
      {!isInternal && !isLanding ? <Navbar /> : null}
      {isLanding ? children : <main className="flex-1 min-h-0">{children}</main>}
    </div>
  );
}
