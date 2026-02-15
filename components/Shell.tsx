"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isAgents = pathname.startsWith("/agents");
  const isLanding = pathname === "/" || pathname.startsWith("/account-deletion") || isAgents;
  const isPublicQuote = pathname.startsWith("/quote/");
  const isAgentApp = pathname.startsWith("/agent-app");
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const isAccountDeletion = pathname.startsWith("/account-deletion");
  const isApp = pathname.startsWith("/dashboard") || pathname.startsWith("/machine") || pathname.startsWith("/conversations") || pathname.startsWith("/projects") || pathname.startsWith("/quotes") || pathname.startsWith("/payments") || pathname.startsWith("/wallet") || pathname.startsWith("/profile") || pathname.startsWith("/paystack") || pathname.startsWith("/white-label") || pathname.startsWith("/sourcing-project");
  const isWhiteLabelLeads = pathname.startsWith("/white-label-leads");

  const shellClass = isLanding
    ? "flex min-h-screen flex-col"
    : isWhiteLabelLeads
      ? "flex flex-col sm:min-h-screen"
      : "min-h-screen flex flex-col";

  return (
    <div className={shellClass}>
      {!isInternal && !isLanding && !isAgents && !isAgentApp && !isAuth && !isApp && !isAccountDeletion && !isPublicQuote ? <Navbar /> : null}
      {isLanding ? children : <main className={isWhiteLabelLeads ? "min-h-0" : "flex-1 min-h-0"}>{children}</main>}
    </div>
  );
}
