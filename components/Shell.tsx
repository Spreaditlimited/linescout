"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isLanding = pathname === "/";
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const isApp = pathname.startsWith("/dashboard") || pathname.startsWith("/machine") || pathname.startsWith("/conversations") || pathname.startsWith("/projects") || pathname.startsWith("/quotes") || pathname.startsWith("/payments") || pathname.startsWith("/wallet") || pathname.startsWith("/profile");

  return (
    <div className={isLanding ? "flex min-h-screen flex-col" : "min-h-screen flex flex-col"}>
      {!isInternal && !isLanding && !isAuth && !isApp ? <Navbar /> : null}
      {isLanding ? children : <main className="flex-1 min-h-0">{children}</main>}
    </div>
  );
}
