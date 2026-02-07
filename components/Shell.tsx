"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isLanding = pathname === "/" || pathname.startsWith("/account-deletion");
  const isAgentApp = pathname.startsWith("/agent-app");
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const isAccountDeletion = pathname.startsWith("/account-deletion");
  const isApp = pathname.startsWith("/dashboard") || pathname.startsWith("/machine") || pathname.startsWith("/conversations") || pathname.startsWith("/projects") || pathname.startsWith("/quotes") || pathname.startsWith("/payments") || pathname.startsWith("/wallet") || pathname.startsWith("/profile") || pathname.startsWith("/paystack") || pathname.startsWith("/white-label") || pathname.startsWith("/sourcing-project");

  return (
    <div className={isLanding ? "flex min-h-screen flex-col" : "min-h-screen flex flex-col"}>
      {!isInternal && !isLanding && !isAgentApp && !isAuth && !isApp && !isAccountDeletion ? <Navbar /> : null}
      {isLanding ? children : <main className="flex-1 min-h-0">{children}</main>}
    </div>
  );
}
