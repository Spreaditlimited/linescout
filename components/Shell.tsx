"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import FloatingWhatsAppButton from "@/components/FloatingWhatsAppButton";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInternal = pathname.startsWith("/internal");
  const isAgents = pathname.startsWith("/agents");
  const isWhiteLabelLeads = pathname.startsWith("/white-label-leads");
  const isWhiteLabelWebinar = pathname.startsWith("/white-label-webinar");
  const isMachineSourcingLeads = pathname.startsWith("/machine-sourcing-webinar");
  const isMachineSourcingWebinar = pathname.startsWith("/machine-sourcing-webinar-video");
  const isImportFromChina = pathname.startsWith("/import-from-china");
  const isWhiteLabelMarketing = pathname === "/white-label" || isWhiteLabelLeads || isWhiteLabelWebinar;
  const isMachineWebinarMarketing = isMachineSourcingLeads || isMachineSourcingWebinar;
  const isAffiliate = pathname.startsWith("/affiliates");
  const isMarketing =
    isImportFromChina ||
    pathname.startsWith("/white-label") ||
    pathname.startsWith("/machines") ||
    pathname.startsWith("/machine-sourcing-webinar") ||
    pathname.startsWith("/machine-sourcing-webinar-video") ||
    pathname.startsWith("/track");
  const isLanding =
    pathname === "/" ||
    isImportFromChina ||
    pathname.startsWith("/account-deletion") ||
    isAgents ||
    pathname.startsWith("/track");
  const isPublicQuote = pathname.startsWith("/quote/") || pathname.startsWith("/shipping-quote/");
  const isAgentApp = pathname.startsWith("/agent-app");
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const isAccountDeletion = pathname.startsWith("/account-deletion");
  const isApp =
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/machine") && !isMachineWebinarMarketing) ||
    pathname.startsWith("/conversations") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/shipments") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/paystack") ||
    (pathname.startsWith("/white-label") && !isWhiteLabelMarketing) ||
    pathname.startsWith("/sourcing-project");
  const isNoStretch =
    isWhiteLabelLeads ||
    isWhiteLabelWebinar ||
    isMachineSourcingLeads ||
    isMachineSourcingWebinar;

  const shellClass = isNoStretch
    ? "flex flex-col"
    : isLanding
      ? "flex min-h-screen flex-col"
      : "min-h-screen flex flex-col";

  const showFloatingWhatsApp =
    !isInternal &&
    !isAgents &&
    !isAgentApp &&
    !isAuth &&
    !isApp &&
    !isAccountDeletion &&
    !isPublicQuote &&
    !isAffiliate;

  return (
    <div className={shellClass}>
      {!isInternal &&
      !isLanding &&
      !isAgents &&
      !isAgentApp &&
      !isAuth &&
      !isApp &&
      !isAccountDeletion &&
      !isPublicQuote &&
      !isMarketing &&
      !isAffiliate ? (
        <Navbar />
      ) : null}
      {isLanding ? children : (
        <main className={isNoStretch ? "min-h-0" : "flex-1 min-h-0"}>{children}</main>
      )}
      {showFloatingWhatsApp ? <FloatingWhatsAppButton /> : null}
    </div>
  );
}
